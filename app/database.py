import sqlite3
import json
from datetime import datetime
from app.config import DB_PATH

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create tickets table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        priority TEXT DEFAULT 'medium',
        category TEXT DEFAULT 'Technical Support',
        sentiment TEXT DEFAULT 'neutral',
        tags TEXT DEFAULT '[]',
        suggested_response TEXT,
        confidence_score REAL DEFAULT 1.0,
        ai_justification TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)
    
    # Create settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """)
    
    # Set default settings
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('openai_model', 'gpt-4o-mini')")
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('openai_api_key', '')")
    
    conn.commit()
    conn.close()

def get_setting(key: str, default: str = "") -> str:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row['value'] if row else default

def set_setting(key: str, value: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
    conn.close()

def create_ticket(ticket: dict) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = datetime.utcnow().isoformat()
    tags_json = json.dumps(ticket.get("tags", []))
    
    cursor.execute("""
    INSERT INTO tickets (
        customer_name, customer_email, subject, description,
        status, priority, category, sentiment, tags,
        suggested_response, confidence_score, ai_justification,
        created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ticket["customer_name"],
        ticket["customer_email"],
        ticket["subject"],
        ticket["description"],
        ticket.get("status", "open"),
        ticket.get("priority", "medium"),
        ticket.get("category", "Technical Support"),
        ticket.get("sentiment", "neutral"),
        tags_json,
        ticket.get("suggested_response", ""),
        ticket.get("confidence_score", 1.0),
        ticket.get("ai_justification", "Local rule-based fallback classification."),
        ticket.get("created_at", now),
        ticket.get("updated_at", now)
    ))
    
    ticket_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return ticket_id

def get_tickets(category: str = None, priority: str = None, status: str = None, search: str = None) -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM tickets WHERE 1=1"
    params = []
    
    if category:
        query += " AND category = ?"
        params.append(category)
    if priority:
        query += " AND priority = ?"
        params.append(priority)
    if status:
        query += " AND status = ?"
        params.append(status)
    if search:
        query += " AND (subject LIKE ? OR description LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?)"
        search_term = f"%{search}%"
        params.extend([search_term, search_term, search_term, search_term])
        
    query += " ORDER BY created_at DESC"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    tickets = []
    for row in rows:
        t = dict(row)
        t["tags"] = json.loads(t["tags"])
        tickets.append(t)
        
    conn.close()
    return tickets

def get_ticket(ticket_id: int) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        t = dict(row)
        t["tags"] = json.loads(t["tags"])
        return t
    return None

def update_ticket(ticket_id: int, updates: dict) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if ticket exists
    cursor.execute("SELECT id FROM tickets WHERE id = ?", (ticket_id,))
    if not cursor.fetchone():
        conn.close()
        return False
        
    now = datetime.utcnow().isoformat()
    updates["updated_at"] = now
    
    set_clauses = []
    params = []
    for k, v in updates.items():
        if k == "tags" and isinstance(v, list):
            v = json.dumps(v)
        set_clauses.append(f"{k} = ?")
        params.append(v)
        
    params.append(ticket_id)
    query = f"UPDATE tickets SET {', '.join(set_clauses)} WHERE id = ?"
    
    cursor.execute(query, params)
    conn.commit()
    conn.close()
    return True

def delete_ticket(ticket_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM tickets WHERE id = ?", (ticket_id,))
    if not cursor.fetchone():
        conn.close()
        return False
        
    cursor.execute("DELETE FROM tickets WHERE id = ?", (ticket_id,))
    conn.commit()
    conn.close()
    return True

def get_analytics_summary() -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Total tickets count
    cursor.execute("SELECT count(*) FROM tickets")
    total_tickets = cursor.fetchone()[0]
    
    # Count by status
    cursor.execute("SELECT status, count(*) FROM tickets GROUP BY status")
    status_counts = {row[0]: row[1] for row in cursor.fetchall()}
    
    # Count by category
    cursor.execute("SELECT category, count(*) FROM tickets GROUP BY category")
    category_counts = {row[0]: row[1] for row in cursor.fetchall()}
    
    # Count by priority
    cursor.execute("SELECT priority, count(*) FROM tickets GROUP BY priority")
    priority_counts = {row[0]: row[1] for row in cursor.fetchall()}
    
    # Count by sentiment
    cursor.execute("SELECT sentiment, count(*) FROM tickets GROUP BY sentiment")
    sentiment_counts = {row[0]: row[1] for row in cursor.fetchall()}
    
    # Average confidence score
    cursor.execute("SELECT avg(confidence_score) FROM tickets WHERE confidence_score IS NOT NULL")
    avg_confidence = cursor.fetchone()[0] or 0.0
    
    # Tickets over time (last 7 days of ticket creation)
    # Simple count by date from ISO datetime strings
    cursor.execute("SELECT substr(created_at, 1, 10) as day, count(*) as count FROM tickets GROUP BY day ORDER BY day DESC LIMIT 10")
    volume_by_day = [{"date": row[0], "count": row[1]} for row in cursor.fetchall()]
    volume_by_day.reverse()
    
    conn.close()
    
    return {
        "total": total_tickets,
        "by_status": status_counts,
        "by_category": category_counts,
        "by_priority": priority_counts,
        "by_sentiment": sentiment_counts,
        "avg_confidence": round(avg_confidence, 2),
        "volume_over_time": volume_by_day
    }
