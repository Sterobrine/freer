from typing import Any, Dict, Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar('T')


class ErrorBody(BaseModel):
    code: str
    message: str


class ApiResponse(BaseModel, Generic[T]):
    ok: bool
    data: Optional[T] = None
    error: Optional[ErrorBody] = None


def ok(data: Any = None) -> Dict[str, Any]:
    return {'ok': True, 'data': data}


def fail(code: str, message: str, status_code: int = 400) -> Dict[str, Any]:
    return {
        'ok': False,
        'error': {'code': code, 'message': message},
        '_status_code': status_code,
    }
