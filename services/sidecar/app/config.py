from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SIDECAR_")

    # Shared secret between the Next.js app and this service (sent as a Bearer token).
    api_key: str = ""
    # Secret for verifying the short-lived signed file tokens the app issues.
    url_signing_key: str = ""
    # Where uploaded documents and rendered specimens are stored on disk.
    files_dir: str = "/var/lib/nidhikavach/files"
    # Browser origins allowed to upload directly (comma separated).
    allowed_origins: str = "https://nidhikavach.vercel.app,http://localhost:3000,http://localhost:3100"
    max_upload_bytes: int = 10 * 1024 * 1024


settings = Settings()
