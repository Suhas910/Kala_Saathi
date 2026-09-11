# backend/app/routers/listings.py
import json
import uuid
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, auth

router = APIRouter(prefix="/listings", tags=["Listings"])

def format_listing_response(listing: models.ListingModel) -> Dict[str, Any]:
    media_list = [
        {
            "id": m.id,
            "kind": m.kind,
            "variant": m.variant,
            "status": m.status,
            "url": m.url
        }
        for m in listing.media
    ]

    catalogue_data = None
    if listing.catalogue:
        catalogue_data = {
            "schema_version": listing.catalogue.schema_version,
            "catalogue": json.loads(listing.catalogue.catalogue_data),
            "field_confidence": json.loads(listing.catalogue.field_confidence),
            "needs_confirmation": json.loads(listing.catalogue.needs_confirmation)
        }

    price_data = None
    if listing.price:
        wage_source = None
        if listing.price.state_code:
            wage_source = {
                "state_code": listing.price.state_code,
                "notification_ref": listing.price.notification_ref or "",
                "effective_from": listing.price.effective_from or "",
                "source_url": listing.price.source_url or ""
            }
        price_data = {
            "calculation_version": listing.price.calculation_version,
            "status": listing.price.status,
            "currency": listing.price.currency,
            "wage_source": wage_source,
            "inputs": {
                "material_cost_paise": listing.price.material_cost_paise,
                "labour_hours": listing.price.labour_hours,
                "hourly_wage_paise": listing.price.hourly_wage_paise,
                "skill_level": listing.price.skill_level
            },
            "floor_amount_paise": listing.price.floor_amount_paise,
            "recommended_low_paise": listing.price.recommended_low_paise,
            "recommended_high_paise": listing.price.recommended_high_paise,
            "explanation": listing.price.explanation or ""
        }

    claims_list = [
        {
            "claim": c.claim,
            "asserted_by_artisan": c.asserted_by_artisan,
            "coordinator_verified": c.coordinator_verified,
            "evidence_note": c.evidence_note
        }
        for c in listing.claims
    ]

    return {
        "id": listing.id,
        "artisan_id": str(listing.artisan_id),
        "state": listing.state,
        "preferred_language": listing.preferred_language,
        "media": media_list,
        "catalogue": catalogue_data,
        "price": price_data,
        "claims": claims_list,
        "created_at": listing.created_at.isoformat() if listing.created_at else "",
        "updated_at": listing.updated_at.isoformat() if listing.updated_at else ""
    }

@router.post("", response_model=schemas.CreateListingResponse)
def create_listing(
    payload: schemas.CreateListingRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    listing = models.ListingModel(
        artisan_id=current_user.user_id,
        state="draft",
        preferred_language=payload.preferred_language or "en"
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)

    return schemas.CreateListingResponse(
        id=listing.id,
        artisan_id=str(listing.artisan_id),
        state=listing.state,
        preferred_language=listing.preferred_language,
        upload_instructions={
            "bucket": "media",
            "max_image_bytes": 10485760,
            "max_audio_bytes": 20971520,
            "allowed_image_types": ["image/jpeg", "image/png", "image/webp"],
            "allowed_audio_types": ["audio/wav", "audio/m4a", "audio/mp4", "audio/aac"]
        }
    )

@router.get("", response_model=List[schemas.ListingResponse])
def list_listings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role in ["coordinator", "admin"]:
        listings = db.query(models.ListingModel).order_by(models.ListingModel.created_at.desc()).all()
    else:
        listings = db.query(models.ListingModel).filter(
            models.ListingModel.artisan_id == current_user.user_id
        ).order_by(models.ListingModel.created_at.desc()).all()

    return [format_listing_response(l) for l in listings]

@router.get("/{listing_id}", response_model=schemas.ListingResponse)
def get_listing(
    listing_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    listing = db.query(models.ListingModel).filter(models.ListingModel.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    
    # Verify access rights
    if current_user.role == "artisan" and listing.artisan_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this listing")

    return format_listing_response(listing)

@router.post("/{listing_id}/media", response_model=schemas.MediaUploadResponse)
def complete_media_upload(
    listing_id: str,
    payload: schemas.MediaUploadRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    listing = db.query(models.ListingModel).filter(models.ListingModel.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    if current_user.role == "artisan" and listing.artisan_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this listing")

    media_id = str(uuid.uuid4())
    default_url = (
        "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800"
        if payload.kind == "image"
        else "https://actions.google.com/sounds/v1/ambiences/outdoor_market.ogg"
    )
    url = payload.url or default_url

    media = models.MediaAssetModel(
        id=media_id,
        listing_id=listing_id,
        kind=payload.kind,
        variant="original",
        status="complete",
        url=url,
        checksum=payload.client_checksum
    )
    db.add(media)
    db.commit()
    db.refresh(media)

    return schemas.MediaUploadResponse(
        status="complete",
        media_id=media.id,
        url=media.url
    )

@router.post("/{listing_id}/confirm")
def confirm_listing(
    listing_id: str,
    payload: schemas.ConfirmListingRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    listing = db.query(models.ListingModel).filter(models.ListingModel.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    if current_user.role == "artisan" and listing.artisan_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to confirm this listing")

    cat_model = db.query(models.CatalogueModel).filter(models.CatalogueModel.listing_id == listing_id).first()
    if not cat_model:
        # Create new if not existing
        cat_model = models.CatalogueModel(
            listing_id=listing_id,
            schema_version="1.0",
            catalogue_data=json.dumps(payload.catalogue),
            field_confidence=json.dumps({}),
            needs_confirmation=json.dumps([])
        )
        db.add(cat_model)
    else:
        # Merge catalogue updates
        current_data = json.loads(cat_model.catalogue_data)
        current_data.update(payload.catalogue)
        cat_model.catalogue_data = json.dumps(current_data)
        # Clear out confirmed fields from needs_confirmation
        current_needs = json.loads(cat_model.needs_confirmation)
        updated_needs = [f for f in current_needs if f not in payload.confirmed_fields]
        cat_model.needs_confirmation = json.dumps(updated_needs)

    listing.state = "awaiting_approval"
    db.commit()

    return {
        "status": "confirmed",
        "listing_id": listing_id,
        "state": listing.state
    }

@router.post("/{listing_id}/submit-for-approval")
@router.post("/{listing_id}/submit-approval")
def submit_for_approval(
    listing_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    listing = db.query(models.ListingModel).filter(models.ListingModel.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    if current_user.role == "artisan" and listing.artisan_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to submit this listing")

    listing.state = "awaiting_approval"
    db.commit()
    return {
        "status": "submitted",
        "listing_id": listing_id,
        "state": "awaiting_approval"
    }
