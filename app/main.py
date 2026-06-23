from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from contextlib import asynccontextmanager
import logging

from app.database import (
    init_db, get_setting, set_setting, create_ticket,
    get_tickets, get_ticket, update_ticket, delete_ticket,
    get_analytics_summary
)
from app.classifier import classify_ticket
from app.config import CATEGORIES, PRIORITIES, SENTIMENTS

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize the database on startup
    logger.info("Initializing SQLite database...")
    init_db()
    yield
    logger.info("Shutting down API server...")

app = FastAPI(
    title="AI Ticket Classification System API",
    description="Backend API for automatically categorizing support tickets using OpenAI API and local fallback rules.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas
class TicketCreate(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=100, examples=["John Doe"])
    customer_email: EmailStr = Field(..., examples=["john.doe@example.com"])
    subject: str = Field(..., min_length=3, max_length=200, examples=["Cannot reset my password"])
    description: str = Field(..., min_length=5, examples=["I click the reset link and it redirects to a 404 page."])

class TicketUpdate(BaseModel):
    status: Optional[str] = Field(None, examples=["pending", "resolved"])
    priority: Optional[str] = Field(None, examples=["high"])
    category: Optional[str] = Field(None, examples=["Billing & Invoices"])

class SettingsUpdate(BaseModel):
    openai_api_key: Optional[str] = Field(None, examples=["sk-proj-..."])
    openai_model: Optional[str] = Field(None, examples=["gpt-4o-mini", "gpt-4o"])

# Root Route: serve frontend index.html
@app.get("/")
async def read_index():
    return FileResponse("static/index.html")

# Ticket Routes
@app.post("/api/tickets", status_code=201)
async def submit_ticket(ticket: TicketCreate):
    try:
        # Retrieve settings
        api_key = get_setting("openai_api_key", "")
        model = get_setting("openai_model", "gpt-4o-mini")
        
        # Run classifier
        logger.info(f"Classifying incoming ticket: '{ticket.subject}'")
        classification = classify_ticket(
            subject=ticket.subject,
            description=ticket.description,
            api_key=api_key,
            model=model
        )
        
        # Combine ticket data
        ticket_data = ticket.dict()
        ticket_data.update(classification)
        ticket_data["status"] = "open"
        
        # Write to DB
        ticket_id = create_ticket(ticket_data)
        
        # Retrieve saved ticket
        saved_ticket = get_ticket(ticket_id)
        return saved_ticket
    except Exception as e:
        logger.error(f"Error submitting ticket: {e}")
        raise HTTPException(status_code=500, detail="Internal server error while processing ticket.")

@app.get("/api/tickets")
async def list_tickets(
    category: Optional[str] = None,
    priority: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None
):
    try:
        tickets = get_tickets(
            category=category,
            priority=priority,
            status=status,
            search=search
        )
        return tickets
    except Exception as e:
        logger.error(f"Error listing tickets: {e}")
        raise HTTPException(status_code=500, detail="Internal server error fetching tickets.")

@app.get("/api/tickets/{ticket_id}")
async def retrieve_ticket(ticket_id: int):
    ticket = get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket

@app.put("/api/tickets/{ticket_id}")
async def modify_ticket(ticket_id: int, updates: TicketUpdate):
    update_data = {k: v for k, v in updates.dict().items() if v is not None}
    
    # Validation checks
    if "status" in update_data and update_data["status"] not in ["open", "pending", "resolved"]:
        raise HTTPException(status_code=400, detail="Invalid status value. Must be 'open', 'pending', or 'resolved'.")
    if "priority" in update_data and update_data["priority"] not in PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Invalid priority value. Must be one of {PRIORITIES}.")
    if "category" in update_data and update_data["category"] not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category value. Must be one of {CATEGORIES}.")
        
    success = update_ticket(ticket_id, update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Ticket not found")
        
    return get_ticket(ticket_id)

@app.delete("/api/tickets/{ticket_id}")
async def remove_ticket(ticket_id: int):
    success = delete_ticket(ticket_id)
    if not success:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"message": "Ticket deleted successfully", "id": ticket_id}

# Analytics Route
@app.get("/api/analytics")
async def fetch_analytics():
    try:
        return get_analytics_summary()
    except Exception as e:
        logger.error(f"Error fetching analytics: {e}")
        raise HTTPException(status_code=500, detail="Internal server error generating analytics.")

# Settings Routes
@app.get("/api/settings")
async def fetch_settings():
    api_key = get_setting("openai_api_key", "")
    model = get_setting("openai_model", "gpt-4o-mini")
    
    # Mask API key for security
    masked_key = ""
    if api_key:
        if len(api_key) > 8:
            masked_key = f"{api_key[:4]}...{api_key[-4:]}"
        else:
            masked_key = "********"
            
    return {
        "openai_model": model,
        "openai_api_key_masked": masked_key,
        "has_api_key": bool(api_key)
    }

@app.post("/api/settings")
async def update_settings(settings: SettingsUpdate):
    if settings.openai_model is not None:
        set_setting("openai_model", settings.openai_model)
        
    if settings.openai_api_key is not None:
        # If API key is provided, update it. If it's a masked dummy key or empty string, let's check.
        # If user clears it, we save empty string
        new_key = settings.openai_api_key.strip()
        if new_key == "":
            set_setting("openai_api_key", "")
            logger.info("OpenAI API key cleared.")
        elif new_key.startswith("sk-"):
            set_setting("openai_api_key", new_key)
            logger.info("OpenAI API key updated.")
        elif new_key.startswith("sk-...") or "..." in new_key:
            # It's the masked key, don't update it (keep existing)
            pass
        else:
            # Try saving it anyway but log warning
            set_setting("openai_api_key", new_key)
            logger.warning("Saved API key that doesn't start with standard sk- prefix.")
            
    return {"message": "Settings updated successfully"}

# Mount static files directory at the bottom, so route declarations have precedence
app.mount("/static", StaticFiles(directory="static"), name="static")
