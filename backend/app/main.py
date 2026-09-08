from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import auth, models, schemas
from .database import get_db, Base, engine

Base.metadata.create_all(bind=engine)
app = FastAPI()

security = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    token = credentials.credentials  # extract token from header
    payload = auth.verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(models.User).filter(models.User.username == payload["sub"]).first()
    return user

@app.get("/")
async def read_root():
    return {"Hello": "World"}

@app.post("/register")
def register(user: schemas.UserRegister, db: Session = Depends(get_db)):
    # check if username already exists
    existing = (
        db.query(models.User).filter(models.User.username == user.username).first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    new_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=auth.hash_password(user.password),  # hash before saving
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/login")
def login(credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(models.User.username == credentials.username)
        .first()
    )

    # check user exists and password matches
    if not user or not auth.verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # generate token with user info inside
    token = auth.create_token({"sub": user.username, "id": user.user_id})
    return {"access_token": token, "token_type": "bearer"}
