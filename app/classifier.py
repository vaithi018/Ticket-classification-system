import json
import logging
from openai import OpenAI
from app.config import CATEGORIES, PRIORITIES, SENTIMENTS

logger = logging.getLogger("app.classifier")

def local_classify_ticket(subject: str, description: str) -> dict:
    """
    Fallback local classifier using rules and keyword matching.
    Provides a quick, smart classification without requiring an OpenAI API key.
    """
    text = (subject + " " + description).lower()
    
    # 1. Determine Category
    category_scores = {cat: 0 for cat in CATEGORIES}
    
    tech_keywords = ["error", "bug", "crash", "install", "login", "password", "slow", "broken", "fail", 
                     "not working", "website", "cannot access", "loading", "code", "app", "server", "down"]
    billing_keywords = ["invoice", "receipt", "charge", "refund", "billing", "payment", "price", "subscription", 
                        "cost", "cancel plan", "card", "pay", "fee", "transaction", "checkout"]
    account_keywords = ["account", "profile", "password reset", "deactivate", "delete account", "email change", 
                        "sign up", "register", "admin", "permissions", "access token", "user info"]
    feature_keywords = ["feature", "suggest", "improve", "add support for", "integration", "enhancement", 
                        "hope to see", "would love", "request", "idea", "new option"]
    feedback_keywords = ["great", "awesome", "good", "bad", "terrible", "love it", "hate it", "happy", 
                         "unhappy", "review", "complaint", "experience", "satisfaction"]
    spam_keywords = ["viagra", "casino", "lottery", "win cash", "advertisement", "seo check", "make money", 
                     "cryptocurrency investment", "free gift", "claim now"]
                     
    for word in tech_keywords:
        if word in text: category_scores["Technical Support"] += 2
    for word in billing_keywords:
        if word in text: category_scores["Billing & Invoices"] += 2
    for word in account_keywords:
        if word in text: category_scores["Account Management"] += 2
    for word in feature_keywords:
        if word in text: category_scores["Feature Request"] += 2
    for word in feedback_keywords:
        if word in text: category_scores["Feedback"] += 1
    for word in spam_keywords:
        if word in text: category_scores["Spam"] += 4
        
    # Get category with highest score (default to Technical Support if zero matches)
    best_category = max(category_scores, key=category_scores.get)
    if category_scores[best_category] == 0:
        best_category = "Technical Support"
        
    # 2. Determine Priority
    priority = "medium"
    urgent_keywords = ["urgent", "immediate", "emergency", "production down", "critical", "loss of data", "security breach", "asap"]
    high_keywords = ["broken", "cannot access", "not working", "refund", "charged twice", "charge", "fail", "error", "payment failed"]
    low_keywords = ["feature request", "suggest", "feedback", "thanks", "hello", "hi there"]
    
    urgent_match = sum(1 for word in urgent_keywords if word in text)
    high_match = sum(1 for word in high_keywords if word in text)
    low_match = sum(1 for word in low_keywords if word in text)
    
    if urgent_match > 0:
        priority = "urgent"
    elif high_match > 0:
        priority = "high"
    elif low_match > 0 and high_match == 0:
        priority = "low"
        
    # 3. Determine Sentiment
    pos_words = ["love", "great", "excellent", "happy", "awesome", "fantastic", "amazing", "good", "helpful", "thanks", "thank you"]
    neg_words = ["bad", "error", "fail", "terrible", "hate", "slow", "broken", "crash", "annoying", "frustrated", "worst", "useless", "expensive"]
    
    pos_count = sum(1 for word in pos_words if word in text)
    neg_count = sum(1 for word in neg_words if word in text)
    
    if pos_count > neg_count:
        sentiment = "positive"
    elif neg_count > pos_count:
        sentiment = "negative"
    else:
        sentiment = "neutral"
        
    # 4. Generate Tags
    tags = []
    all_keywords = tech_keywords + billing_keywords + account_keywords + feature_keywords
    for kw in all_keywords:
        if len(tags) >= 5:
            break
        if kw in text and kw not in tags:
            tags.append(kw)
            
    # 5. Suggested Response Templates
    responses = {
        "Technical Support": (
            "Hi there,\n\n"
            "Thank you for contacting Technical Support. We are sorry to hear that you are experiencing technical difficulties. "
            "Our support team has logged this issue and is looking into it. We will get back to you with troubleshooting steps or updates as soon as possible.\n\n"
            "Best regards,\n"
            "Support Team"
        ),
        "Billing & Invoices": (
            "Hi there,\n\n"
            "Thank you for reaching out. We have received your inquiry regarding billing/invoices. "
            "Our billing team will review your account charges and invoice history to address your concerns. Please expect a reply within 24 hours.\n\n"
            "Best regards,\n"
            "Billing Team"
        ),
        "Account Management": (
            "Hi there,\n\n"
            "Thank you for your message regarding your account settings. "
            "We have queued this request for our account security team. For security purposes, please do not reply with passwords or credit card numbers. "
            "An administrator will follow up shortly.\n\n"
            "Best regards,\n"
            "Account Security Team"
        ),
        "Feature Request": (
            "Hi there,\n\n"
            "Thank you for suggesting this feature! We are always looking for ways to improve our platform. "
            "We have forwarded your feedback to our Product Management team for consideration in future updates. We appreciate you taking the time to share your ideas.\n\n"
            "Best regards,\n"
            "Product Team"
        ),
        "Feedback": (
            "Hi there,\n\n"
            "Thank you for sharing your feedback with us. "
            "Customer opinions are highly valuable to us, and we use them to improve our product experience. Let us know if you need any direct assistance.\n\n"
            "Best regards,\n"
            "Customer Success Team"
        ),
        "Spam": (
            "Hello,\n\n"
            "This email has been flagged as advertisement or spam. No action is required."
        )
    }
    
    suggested_response = responses.get(best_category, "Hello,\n\nThank you for your ticket. We will respond shortly.")
    
    return {
        "category": best_category,
        "priority": priority,
        "sentiment": sentiment,
        "tags": tags,
        "confidence_score": 0.70,  # Rules-based is set to 70% default confidence
        "ai_justification": "Classified locally using keyword heuristics: category matched based on text density; priority assigned from urgency keywords.",
        "suggested_response": suggested_response
    }

def classify_ticket(subject: str, description: str, api_key: str = "", model: str = "gpt-4o-mini") -> dict:
    """
    Classifies a ticket using OpenAI API. Falls back to local heuristics if API key is not valid/empty or if an error occurs.
    """
    if not api_key:
        logger.info("No OpenAI API key provided. Using local heuristics fallback classifier.")
        return local_classify_ticket(subject, description)
        
    try:
        client = OpenAI(api_key=api_key)
        
        system_prompt = f"""You are an advanced support ticket classifier for a SaaS platform.
Analyze the customer support ticket (Subject and Description) and respond with a structured JSON object containing:
- "category": Must be exactly one of: {json.dumps(CATEGORIES)}
- "priority": Must be exactly one of: {json.dumps(PRIORITIES)}
- "sentiment": Must be exactly one of: {json.dumps(SENTIMENTS)}
- "tags": A list of up to 5 relevant tags/keywords (strings)
- "confidence_score": A float between 0.0 and 1.0 indicating your confidence in this classification
- "ai_justification": A brief (1-2 sentences) explanation of why you selected this category and priority.
- "suggested_response": A professional, helpful draft reply addressing the customer's specific issue. Use placeholders for names if not available.

You must return ONLY a raw JSON object matching this structure."""

        user_content = f"Subject: {subject}\n\nDescription:\n{description}"
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            response_format={"type": "json_object"},
            temperature=0.0
        )
        
        raw_content = response.choices[0].message.content
        result = json.loads(raw_content)
        
        # Validate output schema
        if result.get("category") not in CATEGORIES:
            result["category"] = "Technical Support"
        if result.get("priority") not in PRIORITIES:
            result["priority"] = "medium"
        if result.get("sentiment") not in SENTIMENTS:
            result["sentiment"] = "neutral"
        if not isinstance(result.get("tags"), list):
            result["tags"] = []
        if not isinstance(result.get("confidence_score"), (int, float)):
            result["confidence_score"] = 0.90
            
        return result
        
    except Exception as e:
        logger.error(f"Error calling OpenAI API: {e}. Falling back to local classifier.")
        return local_classify_ticket(subject, description)
