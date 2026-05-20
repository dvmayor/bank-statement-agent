from datetime import date
from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, Field


class Category(str, Enum):
    DINING = "Dining"
    GROCERIES = "Groceries"
    TRANSPORT = "Transport"
    BILLS = "Bills"
    SALARY = "Salary"
    ENTERTAINMENT = "Entertainment"
    HEALTHCARE = "Healthcare"
    SHOPPING = "Shopping"
    TRANSFER = "Transfer"
    ATM = "ATM"
    TRAVEL = "Travel"
    INSURANCE = "Insurance"
    EDUCATION = "Education"
    OTHER = "Other"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Transaction(BaseModel):
    date: date
    description: str
    debit: Optional[float] = None
    credit: Optional[float] = None
    balance: Optional[float] = None
    category: Optional[Category] = None
    confidence: Confidence = Confidence.HIGH


class Anomaly(BaseModel):
    transaction_index: int
    type: Literal["duplicate", "large_debit", "unusual_hours", "round_number", "velocity_spike"]
    severity: Literal["info", "warning", "alert"]
    reasoning: str


class CategoryBreakdown(BaseModel):
    category: Category
    total: float
    count: int
    percentage: float


class Summary(BaseModel):
    period_start: date
    period_end: date
    total_credits: float
    total_debits: float
    net_cashflow: float
    top_categories: list[CategoryBreakdown]
    anomaly_count: int
    narrative: str = Field(..., description="Plain-English monthly summary")


class AnalysisResult(BaseModel):
    transactions: list[Transaction]
    anomalies: list[Anomaly]
    summary: Summary
    metadata: dict = Field(default_factory=dict)
