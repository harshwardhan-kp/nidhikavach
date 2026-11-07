from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SIDECAR_")

    # Shared secret between the Next.js app and this service (sent as a Bearer token).
    api_key: str = ""
    # Where uploaded documents are stored on disk.
    files_dir: str = "/var/lib/nidhikavach/files"
    # Secret for signing short-lived file URLs.
    url_signing_key: str = ""


settings = Settings()
