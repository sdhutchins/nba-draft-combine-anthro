import logging
from pathlib import Path
from time import sleep

import pandas as pd
import requests

logger = logging.getLogger(__name__)

NBA_ANTHRO_URL = "https://stats.nba.com/stats/draftcombineplayeranthro"
FIRST_COMBINE_YEAR = 2001
LAST_COMBINE_YEAR = 2026
REQUEST_TIMEOUT_SECONDS = 30
REQUEST_DELAY_SECONDS = 30
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "anthro_data.csv"

REQUEST_HEADERS = {
    "Host": "stats.nba.com",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/145.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Referer": "https://www.nba.com/",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
    "Sec-Ch-Ua": (
        '"Not:A-Brand";v="99", "Google Chrome";v="145", '
        '"Chromium";v="145"'
    ),
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Fetch-Dest": "empty",
}

OUTPUT_COLUMNS = [
    "SEASON_YEAR",
    "PLAYER_ID",
    "FIRST_NAME",
    "LAST_NAME",
    "POSITION",
    "HEIGHT_WO_SHOES_FT_IN",
    "HEIGHT_W_SHOES_FT_IN",
    "WEIGHT",
    "WINGSPAN_FT_IN",
    "STANDING_REACH_FT_IN",
    "BODY_FAT_PCT",
    "HAND_LENGTH",
    "HAND_WIDTH",
]


def parse_anthro_data(payload: dict[str, object], season_year: int) -> pd.DataFrame:
    """Convert one validated NBA response into the site's table schema."""
    result_sets = payload.get("resultSets")
    if not isinstance(result_sets, list):
        raise ValueError("NBA response does not contain a resultSets list.")

    results = next(
        (
            result_set
            for result_set in result_sets
            if isinstance(result_set, dict) and result_set.get("name") == "Results"
        ),
        None,
    )
    if results is None:
        raise ValueError("NBA response does not contain the Results result set.")

    headers = results.get("headers")
    rows = results.get("rowSet")
    if not isinstance(headers, list) or not isinstance(rows, list):
        raise ValueError("The Results result set has an invalid structure.")
    if not rows:
        raise ValueError(f"NBA returned no combine rows for {season_year}.")

    missing_columns = sorted(set(OUTPUT_COLUMNS[1:]) - set(headers))
    if missing_columns:
        missing = ", ".join(missing_columns)
        raise ValueError(f"NBA response is missing required columns: {missing}")

    season_data = pd.DataFrame(rows, columns=headers)
    season_data.insert(0, "SEASON_YEAR", season_year)
    return season_data.loc[:, OUTPUT_COLUMNS]


def fetch_anthro_data(
    session: requests.Session,
    season_year: int,
) -> pd.DataFrame:
    """Retrieve and validate one NBA Draft Combine season."""
    response = session.get(
        NBA_ANTHRO_URL,
        params={"LeagueID": "00", "SeasonYear": season_year},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return parse_anthro_data(response.json(), season_year)


def download_anthro_data(output_path: Path = OUTPUT_PATH) -> None:
    """Download missing seasons and atomically update the site CSV."""
    if output_path.exists():
        existing_data = pd.read_csv(output_path)
        missing_columns = sorted(set(OUTPUT_COLUMNS) - set(existing_data.columns))
        if missing_columns:
            missing = ", ".join(missing_columns)
            raise ValueError(f"Existing CSV is missing required columns: {missing}")
        if existing_data.duplicated(["SEASON_YEAR", "PLAYER_ID"]).any():
            raise ValueError("Existing CSV has duplicate season and player IDs.")
        existing_data = existing_data.loc[:, OUTPUT_COLUMNS]
    else:
        existing_data = pd.DataFrame(columns=OUTPUT_COLUMNS)

    existing_years = set(existing_data["SEASON_YEAR"].astype(int))
    season_years = [
        season_year
        for season_year in range(FIRST_COMBINE_YEAR, LAST_COMBINE_YEAR + 1)
        if season_year not in existing_years
    ]
    if not season_years:
        logger.info("No missing combine seasons. The CSV is already current.")
        return

    season_tables = [existing_data]

    with requests.Session() as session:
        session.headers.update(REQUEST_HEADERS)
        for year_index, season_year in enumerate(season_years):
            season_data = fetch_anthro_data(session, season_year)
            season_tables.append(season_data)
            logger.info(
                "Added %s combine data with %s rows.",
                season_year,
                len(season_data),
            )
            if year_index < len(season_years) - 1:
                sleep(REQUEST_DELAY_SECONDS)

    combined_data = pd.concat(season_tables, ignore_index=True)
    if combined_data.duplicated(["SEASON_YEAR", "PLAYER_ID"]).any():
        raise ValueError("Combined data has duplicate season and player IDs.")
    temporary_path = output_path.with_suffix(f"{output_path.suffix}.tmp")
    combined_data.to_csv(temporary_path, index=False)
    temporary_path.replace(output_path)
    logger.info("Wrote %s rows to %s.", len(combined_data), output_path)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    download_anthro_data()


if __name__ == "__main__":
    main()
