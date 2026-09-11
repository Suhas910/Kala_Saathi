# backend/app/database.py
import os
import logging
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")
SQLITE_URL = "sqlite:///./karigari.db"

def create_resilient_engine():
    target_url = DATABASE_URL
    if target_url:
        if target_url.startswith("postgresql://"):
            target_url = target_url.replace("postgresql://", "postgresql+psycopg2://", 1)
        try:
            connect_args = {"connect_timeout": 3} if "postgresql" in target_url else {}
            eng = create_engine(
                target_url,
                connect_args=connect_args,
                pool_pre_ping=True,
            )
            with eng.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Connected to primary database: %s", target_url.split("@")[-1])
            return eng
        except Exception as exc:
            logger.warning("Failed to connect to primary DATABASE_URL (%s). Falling back to SQLite: %s", exc, SQLITE_URL)

    eng = create_engine(
        SQLITE_URL,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
    )
    logger.info("Using database: %s", SQLITE_URL)
    return eng

engine = create_resilient_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
