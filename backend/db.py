from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

class Base(DeclarativeBase):
    pass

def make_engine(database_url: str):
    connect_args = {}
    if database_url.startswith("sqlite:///"):
        connect_args = {"check_same_thread": False}
    return create_engine(database_url, future=True, connect_args=connect_args)

def make_session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
