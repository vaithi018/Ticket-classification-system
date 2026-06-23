import os

# Categories for ticket classification
CATEGORIES = [
    "Technical Support",
    "Billing & Invoices",
    "Account Management",
    "Feature Request",
    "Feedback",
    "Spam"
]

# Priorities for ticket classification
PRIORITIES = [
    "low",
    "medium",
    "high",
    "urgent"
]

# Sentiments
SENTIMENTS = [
    "positive",
    "neutral",
    "negative"
]

# Database settings
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tickets.db")

# Default model
DEFAULT_MODEL = "gpt-4o-mini"
