import uvicorn

from config import get_config
from freer_log import setup_logging


def main():
    setup_logging()
    cfg = get_config()
    uvicorn.run(
        'freer_api.app:app',
        host=cfg.api.host,
        port=cfg.api.port,
        reload=False,
    )


if __name__ == '__main__':
    main()
