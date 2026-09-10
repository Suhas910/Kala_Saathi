import uuid
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user
from ..supabase_client import supabase
from .. import models, schemas

router = APIRouter()

@router.post("/users/{user_id}/products/add-product")
def add_product(
    user_id: int,
    product: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Check if the current user is the owner of the product
    if current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="You are not authorized to add products for this user.")

    new_product = models.Product(
        name=product.name,
        description=product.description,
        price=product.price,
        user_id=user_id
    )
    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    return new_product