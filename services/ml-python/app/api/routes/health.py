from fastapi import APIRouter

router = APIRouter()


@router.get("")
@router.get("/")
def health_check():
    return {"status": "healthy", "service": "ml-python"}
