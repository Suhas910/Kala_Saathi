# backend/app/routers/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from .. import models, schemas, auth

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=schemas.TokenResponse)
def register(user_data: schemas.UserRegister, db: Session = Depends(get_db)):
    # Check if username exists
    if db.query(models.User).filter(models.User.username == user_data.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered",
        )
    # Check if email exists
    if db.query(models.User).filter(models.User.email == user_data.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address already registered",
        )

    role = (
        user_data.role
        if user_data.role in ["artisan", "coordinator", "admin"]
        else "artisan"
    )
    new_user = models.User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=auth.hash_password(user_data.password),
        role=role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = auth.create_token(
        {"sub": new_user.username, "id": new_user.user_id, "role": new_user.role}
    )
    return schemas.TokenResponse(
        access_token=token,
        token_type="bearer",
        role=new_user.role,
        user_id=new_user.user_id,
        username=new_user.username,
    )


@router.post("/login", response_model=schemas.TokenResponse)
def login(credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(models.User.username == credentials.username)
        .first()
    )
    if not user or not auth.verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = auth.create_token(
        {"sub": user.username, "id": user.user_id, "role": user.role}
    )
    return schemas.TokenResponse(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.user_id,
        username=user.username,
    )


@router.post("/refresh")
def refresh_token(current_user: models.User = Depends(auth.get_user_for_refresh)):
    token = auth.create_token(
        {
            "sub": current_user.username,
            "id": current_user.user_id,
            "role": current_user.role,
        }
    )
    return {
        "access_token": token,
        "token": token,  # Aliased for frontend compatibility
        "token_type": "bearer",
        "role": current_user.role,
    }


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    return schemas.UserResponse(
        user_id=current_user.user_id,
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
    )
