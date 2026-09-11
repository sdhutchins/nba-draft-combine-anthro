import * as React from "react";
import {createRoot} from "react-dom/client";
import htm from "htm";
import {
    Button,
    Icon,
    MultiSelector,
    NumberInput,
    Pagination,
    Popover,
    Table,
    TextInput,
    Theme,
    Token,
    pixel,
    useTableSortable,
    useTableSortableState,
} from "@astryxdesign/core";
import {neutralTheme} from "@astryxdesign/theme-neutral";

const html = htm.bind(React.createElement);
const DATA_PATH = "data/anthro_data.csv";
const POSITION_OPTIONS = ["PG", "SG", "SF", "PF", "C"].map((position) => ({
    label: position,
    value: position,
}));
const HEIGHT_RANGE_OPTIONS = [
    {value: "under-72", label: "Under 6'0\"", minimum: null, maximum: 72},
    {value: "72-75", label: "6'0\" to under 6'3\"", minimum: 72, maximum: 75},
    {value: "75-78", label: "6'3\" to under 6'6\"", minimum: 75, maximum: 78},
    {value: "78-81", label: "6'6\" to under 6'9\"", minimum: 78, maximum: 81},
    {value: "81-84", label: "6'9\" to under 7'0\"", minimum: 81, maximum: 84},
    {value: "84-plus", label: "7'0\" and taller", minimum: 84, maximum: null},
];
const EMPTY_RANGES = {
    minimumWeight: null,
    maximumWeight: null,
    minimumWingspan: null,
    maximumWingspan: null,
};

function parseCsv(csvText) {
    const records = [];
    let currentField = "";
    let currentRecord = [];
    let isInsideQuotes = false;

    for (let characterIndex = 0; characterIndex < csvText.length; characterIndex += 1) {
        const character = csvText[characterIndex];
        const nextCharacter = csvText[characterIndex + 1];

        if (character === '"' && isInsideQuotes && nextCharacter === '"') {
            currentField += '"';
            characterIndex += 1;
        } else if (character === '"') {
            isInsideQuotes = !isInsideQuotes;
        } else if (character === "," && !isInsideQuotes) {
            currentRecord.push(currentField);
            currentField = "";
        } else if (character === "\n" && !isInsideQuotes) {
            currentRecord.push(currentField.replace(/\r$/, ""));
            records.push(currentRecord);
            currentField = "";
            currentRecord = [];
        } else {
            currentField += character;
        }
    }

    if (currentField || currentRecord.length) {
        currentRecord.push(currentField.replace(/\r$/, ""));
        records.push(currentRecord);
    }

    const [headers, ...dataRecords] = records;
    if (!headers) {
        return [];
    }

    return dataRecords
        .filter((record) => record.some((value) => value !== ""))
        .map((record) => Object.fromEntries(
            headers.map((header, columnIndex) => [header, record[columnIndex] ?? ""]),
        ));
}

function escapeCsvValue(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function createDownloadFilename(now = new Date()) {
    const timestampParts = [
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
    ].map((value) => String(value).padStart(2, "0"));
    return `${timestampParts.join("_")}_nba_combine_anthro_filtered.csv`;
}

function downloadCsv(records) {
    if (!records.length) {
        return;
    }

    const headers = Object.keys(records[0].sourceRecord);
    const rows = [
        headers,
        ...records.map(({sourceRecord}) =>
            headers.map((header) => sourceRecord[header]),
        ),
    ];
    const csvText = `${rows
        .map((row) => row.map(escapeCsvValue).join(","))
        .join("\n")}\n`;
    const downloadUrl = URL.createObjectURL(
        new Blob([csvText], {type: "text/csv;charset=utf-8"}),
    );
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = createDownloadFilename();
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
}

function parseFeetAndInches(measurement) {
    const match = measurement.match(/^(\d+)'\s*([\d.]+)(?:"|'')$/);
    if (!match) {
        return null;
    }
    return Number(match[1]) * 12 + Number(match[2]);
}

function parseOptionalNumber(value) {
    if (value === "") {
        return null;
    }
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
}

function normalizeRecord(record) {
    const firstName = record.FIRST_NAME.trim();
    const lastName = record.LAST_NAME.trim();
    const season = Number(record.SEASON_YEAR);
    const playerId = Number(record.PLAYER_ID);

    return {
        id: `${season}-${playerId}`,
        sourceRecord: record,
        season,
        playerId,
        firstName,
        lastName,
        playerName: [firstName, lastName].filter(Boolean).join(" "),
        position: record.POSITION,
        heightWithoutShoes: parseFeetAndInches(record.HEIGHT_WO_SHOES_FT_IN),
        heightWithoutShoesDisplay: record.HEIGHT_WO_SHOES_FT_IN,
        heightWithShoes: parseFeetAndInches(record.HEIGHT_W_SHOES_FT_IN),
        heightWithShoesDisplay: record.HEIGHT_W_SHOES_FT_IN,
        weight: parseOptionalNumber(record.WEIGHT),
        wingspan: parseFeetAndInches(record.WINGSPAN_FT_IN),
        wingspanDisplay: record.WINGSPAN_FT_IN,
        standingReach: parseFeetAndInches(record.STANDING_REACH_FT_IN),
        standingReachDisplay: record.STANDING_REACH_FT_IN,
        bodyFat: parseOptionalNumber(record.BODY_FAT_PCT),
        handLength: parseOptionalNumber(record.HAND_LENGTH),
        handWidth: parseOptionalNumber(record.HAND_WIDTH),
    };
}

function displayMeasurement(value, suffix = "") {
    return value === null ? "N/A" : `${value}${suffix}`;
}

function compareOptionalNumbers(firstValue, secondValue, direction) {
    const firstIsMissing = firstValue === null;
    const secondIsMissing = secondValue === null;

    if (firstIsMissing || secondIsMissing) {
        if (firstIsMissing === secondIsMissing) {
            return 0;
        }
        const missingOrder = firstIsMissing ? 1 : -1;
        return direction === "ascending" ? missingOrder : -missingOrder;
    }
    return firstValue - secondValue;
}

const TABLE_COLUMNS = [
    {
        key: "season",
        header: "Season",
        width: pixel(80),
        align: "end",
        sortable: true,
    },
    {
        key: "playerName",
        header: "Player",
        width: pixel(190),
        sortable: {sortKey: "lastName"},
    },
    {
        key: "position",
        header: "Position",
        width: pixel(80),
        sortable: true,
        renderCell: (record) => record.position || "Not listed",
    },
    {
        key: "heightWithoutShoes",
        header: "Height w/o shoes",
        width: pixel(135),
        sortable: true,
        renderCell: (record) => record.heightWithoutShoesDisplay || "N/A",
    },
    {
        key: "heightWithShoes",
        header: "Height w/ shoes",
        width: pixel(120),
        sortable: true,
        renderCell: (record) => record.heightWithShoesDisplay || "N/A",
    },
    {
        key: "weight",
        header: "Weight",
        width: pixel(95),
        align: "end",
        sortable: true,
        renderCell: (record) => displayMeasurement(record.weight, " lb"),
    },
    {
        key: "wingspan",
        header: "Wingspan",
        width: pixel(110),
        sortable: true,
        renderCell: (record) => record.wingspanDisplay || "N/A",
    },
    {
        key: "standingReach",
        header: "Standing reach",
        width: pixel(110),
        sortable: true,
        renderCell: (record) => record.standingReachDisplay || "N/A",
    },
    {
        key: "bodyFat",
        header: "Body fat",
        width: pixel(90),
        align: "end",
        sortable: true,
        renderCell: (record) => displayMeasurement(record.bodyFat, "%"),
    },
    {
        key: "handLength",
        header: "Hand length",
        width: pixel(105),
        align: "end",
        sortable: true,
        renderCell: (record) => displayMeasurement(record.handLength, " in"),
    },
    {
        key: "handWidth",
        header: "Hand width",
        width: pixel(100),
        align: "end",
        sortable: true,
        renderCell: (record) => displayMeasurement(record.handWidth, " in"),
    },
];

const DEFAULT_COLUMN_KEYS = TABLE_COLUMNS.map((column) => column.key);

const COLUMN_OPTIONS = TABLE_COLUMNS.map((column) => ({
    value: column.key,
    label: String(column.header),
    disabled: column.key === "playerName",
}));

function includesPosition(positionValue, selectedPositions) {
    if (!selectedPositions.length) {
        return true;
    }
    return selectedPositions.some((position) => positionValue.split("-").includes(position));
}

function isWithinRange(value, minimum, maximum) {
    if (minimum === null && maximum === null) {
        return true;
    }
    if (value === null) {
        return false;
    }
    return (minimum === null || value >= minimum) &&
        (maximum === null || value <= maximum);
}

function includesHeightRange(height, selectedRanges) {
    if (!selectedRanges.length) {
        return true;
    }
    if (height === null) {
        return false;
    }
    return selectedRanges.some((selectedRange) => {
        const range = HEIGHT_RANGE_OPTIONS.find((option) => option.value === selectedRange);
        return range &&
            (range.minimum === null || height >= range.minimum) &&
            (range.maximum === null || height < range.maximum);
    });
}

function Filters({heightRanges, ranges, onHeightRangesChange, onChange, onClear}) {
    const fields = [
        ["minimumWeight", "Minimum weight", "lb"],
        ["maximumWeight", "Maximum weight", "lb"],
        ["minimumWingspan", "Minimum wingspan", "in"],
        ["maximumWingspan", "Maximum wingspan", "in"],
    ];

    return html`
        <div className="range-panel">
            <h2>Filters</h2>
            <p>Select height ranges or enter measurement limits.</p>
            <${MultiSelector}
                label="Height"
                options=${HEIGHT_RANGE_OPTIONS}
                value=${heightRanges}
                onChange=${onHeightRangesChange}
                placeholder="Height"
                hasClear=${true}
                triggerDisplay="labels"
                formatValue=${(items) => items.length === 1 ?
                    items[0].label : `${items.length} height ranges`}
                width="100%"
            />
            <div className="range-grid">
                ${fields.map(([key, label, units]) => html`
                    <${NumberInput}
                        key=${key}
                        label=${label}
                        value=${ranges[key]}
                        onChange=${(value) => onChange(key, value)}
                        hasClear=${true}
                        units=${units}
                        min=${0}
                        step=${0.25}
                        width="100%"
                    />
                `)}
            </div>
            <div className="range-actions">
                <${Button} label="Clear filters" onClick=${onClear} />
            </div>
        </div>
    `;
}

function ActiveFilters({query, seasons, positions, heightRanges, ranges, clearHandlers}) {
    const tokens = [];
    if (query) {
        tokens.push(html`
            <${Token}
                key="query"
                label=${`Player: ${query}`}
                onRemove=${clearHandlers.query}
            />
        `);
    }
    if (seasons.length) {
        tokens.push(html`
            <${Token}
                key="seasons"
                label=${`Season: ${seasons.join(", ")}`}
                onRemove=${clearHandlers.seasons}
            />
        `);
    }
    if (positions.length) {
        tokens.push(html`
            <${Token}
                key="positions"
                label=${`Position: ${positions.join(", ")}`}
                onRemove=${clearHandlers.positions}
            />
        `);
    }

    heightRanges.forEach((heightRange) => {
        const option = HEIGHT_RANGE_OPTIONS.find(({value}) => value === heightRange);
        if (option) {
            tokens.push(html`
                <${Token}
                    key=${`height-${heightRange}`}
                    label=${`Height: ${option.label}`}
                    onRemove=${() => clearHandlers.heightRange(heightRange)}
                />
            `);
        }
    });

    const rangeLabels = [
        ["minimumWeight", "Weight at least", "lb"],
        ["maximumWeight", "Weight at most", "lb"],
        ["minimumWingspan", "Wingspan at least", "in"],
        ["maximumWingspan", "Wingspan at most", "in"],
    ];
    rangeLabels.forEach(([key, label, units]) => {
        if (ranges[key] !== null) {
            tokens.push(html`
                <${Token}
                    key=${key}
                    label=${`${label}: ${ranges[key]} ${units}`}
                    onRemove=${() => clearHandlers.range(key)}
                />
            `);
        }
    });

    if (!tokens.length) {
        return null;
    }
    return html`<div className="active-filters" aria-label="Active filters">${tokens}</div>`;
}

function App() {
    const [records, setRecords] = React.useState([]);
    const [loadError, setLoadError] = React.useState("");
    const [query, setQuery] = React.useState("");
    const [selectedSeasons, setSelectedSeasons] = React.useState([]);
    const [selectedPositions, setSelectedPositions] = React.useState([]);
    const [selectedHeightRanges, setSelectedHeightRanges] = React.useState([]);
    const [ranges, setRanges] = React.useState(EMPTY_RANGES);
    const [activeColumnKeys, setActiveColumnKeys] = React.useState(DEFAULT_COLUMN_KEYS);
    const [page, setPage] = React.useState(1);
    const [pageSize, setPageSize] = React.useState(50);
    const [sort, setSort] = React.useState([
        {sortKey: "season", direction: "descending"},
    ]);

    React.useEffect(() => {
        let isMounted = true;
        fetch(DATA_PATH)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Data request failed with status ${response.status}.`);
                }
                return response.text();
            })
            .then((csvText) => {
                if (isMounted) {
                    setRecords(parseCsv(csvText).map(normalizeRecord));
                }
            })
            .catch((error) => {
                if (isMounted) {
                    setLoadError(error.message);
                }
            });
        return () => {
            isMounted = false;
        };
    }, []);

    const seasonOptions = React.useMemo(() => {
        const seasons = [...new Set(records.map((record) => record.season))];
        return seasons
            .sort((firstSeason, secondSeason) => secondSeason - firstSeason)
            .map((season) => ({value: String(season), label: String(season)}));
    }, [records]);

    const normalizedQuery = query.trim().toLowerCase();
    const filteredRecords = React.useMemo(() => records.filter((record) => {
        const matchesQuery = !normalizedQuery || [
            record.playerName,
            record.playerId,
            record.season,
        ].some((value) => String(value).toLowerCase().includes(normalizedQuery));
        const matchesSeason = !selectedSeasons.length ||
            selectedSeasons.includes(String(record.season));

        return matchesQuery &&
            matchesSeason &&
            includesPosition(record.position, selectedPositions) &&
            includesHeightRange(record.heightWithoutShoes, selectedHeightRanges) &&
            isWithinRange(record.weight, ranges.minimumWeight, ranges.maximumWeight) &&
            isWithinRange(
                record.wingspan,
                ranges.minimumWingspan,
                ranges.maximumWingspan,
            );
    }), [
        records,
        normalizedQuery,
        selectedSeasons,
        selectedPositions,
        selectedHeightRanges,
        ranges,
    ]);

    const comparators = React.useMemo(() => {
        function compareMeasurement(firstValue, secondValue, sortKey) {
            const direction = sort.find((entry) => entry.sortKey === sortKey)?.direction ??
                "ascending";
            return compareOptionalNumbers(firstValue, secondValue, direction);
        }

        return {
            season: (firstRecord, secondRecord) => firstRecord.season - secondRecord.season,
            lastName: (firstRecord, secondRecord) => firstRecord.lastName.localeCompare(secondRecord.lastName),
            heightWithoutShoes: (firstRecord, secondRecord) => compareMeasurement(
                firstRecord.heightWithoutShoes,
                secondRecord.heightWithoutShoes,
                "heightWithoutShoes",
            ),
            heightWithShoes: (firstRecord, secondRecord) => compareMeasurement(
                firstRecord.heightWithShoes,
                secondRecord.heightWithShoes,
                "heightWithShoes",
            ),
            weight: (firstRecord, secondRecord) => compareMeasurement(
                firstRecord.weight,
                secondRecord.weight,
                "weight",
            ),
            wingspan: (firstRecord, secondRecord) => compareMeasurement(
                firstRecord.wingspan,
                secondRecord.wingspan,
                "wingspan",
            ),
            standingReach: (firstRecord, secondRecord) => compareMeasurement(
                firstRecord.standingReach,
                secondRecord.standingReach,
                "standingReach",
            ),
            bodyFat: (firstRecord, secondRecord) => compareMeasurement(
                firstRecord.bodyFat,
                secondRecord.bodyFat,
                "bodyFat",
            ),
            handLength: (firstRecord, secondRecord) => compareMeasurement(
                firstRecord.handLength,
                secondRecord.handLength,
                "handLength",
            ),
            handWidth: (firstRecord, secondRecord) => compareMeasurement(
                firstRecord.handWidth,
                secondRecord.handWidth,
                "handWidth",
            ),
        };
    }, [sort]);
    const {sortedData, sortConfig} = useTableSortableState({
        data: filteredRecords,
        sort,
        onSortChange: setSort,
        comparators,
    });
    const sortablePlugin = useTableSortable(sortConfig);

    React.useEffect(() => {
        setPage(1);
    }, [
        query,
        selectedSeasons,
        selectedPositions,
        selectedHeightRanges,
        ranges,
        pageSize,
        sort,
    ]);

    const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const visibleRecords = sortedData.slice(
        (safePage - 1) * pageSize,
        safePage * pageSize,
    );
    const firstVisibleRecord = (safePage - 1) * pageSize + 1;
    const lastVisibleRecord = Math.min(safePage * pageSize, sortedData.length);
    const paginationSummary = `${firstVisibleRecord.toLocaleString()}-${lastVisibleRecord.toLocaleString()} of ${sortedData.length.toLocaleString()}`;
    const visibleColumns = TABLE_COLUMNS.filter((column) =>
        activeColumnKeys.includes(column.key),
    );
    const activeFilterCount = selectedHeightRanges.length +
        Object.values(ranges).filter((value) => value !== null).length;
    const hasActiveFilters = Boolean(
        query || selectedSeasons.length || selectedPositions.length || activeFilterCount,
    );

    function updateRange(key, value) {
        setRanges((currentRanges) => ({...currentRanges, [key]: value}));
    }

    function updateColumns(nextColumnKeys) {
        const requestedKeys = new Set(["playerName", ...nextColumnKeys]);
        setActiveColumnKeys(
            TABLE_COLUMNS
                .map((column) => column.key)
                .filter((columnKey) => requestedKeys.has(columnKey)),
        );
    }

    function clearAllFilters() {
        setQuery("");
        setSelectedSeasons([]);
        setSelectedPositions([]);
        setSelectedHeightRanges([]);
        setRanges(EMPTY_RANGES);
    }

    const clearHandlers = {
        query: () => setQuery(""),
        seasons: () => setSelectedSeasons([]),
        positions: () => setSelectedPositions([]),
        heightRange: (heightRange) => setSelectedHeightRanges(
            (currentRanges) => currentRanges.filter((value) => value !== heightRange),
        ),
        range: (key) => updateRange(key, null),
    };

    return html`
        <${Theme} theme=${neutralTheme} mode="light">
            <main className="site-shell">
                <header className="page-header">
                    <div>
                        <h1>NBA Combine Anthro Data</h1>
                        <p>
                            Explore NBA Draft Combine anthropometric data from 2001 through 2026.
                            Measurements come from the${" "}
                            <a href="https://www.nba.com/stats/draft/combine-anthro">NBA combine anthro table</a>.
                        </p>
                    </div>
                    <${Button}
                        label="Follow me: @slayinmaven"
                        href="https://x.com/slayinmaven"
                        target="_blank"
                        rel="noopener noreferrer"
                        icon=${html`<${Icon} icon="externalLink" size="sm" />`}
                    />
                </header>

                <section className="table-surface" aria-labelledby="table-title">
                    <div className="table-heading">
                        <div>
                            <h2 id="table-title">Combine measurements</h2>
                            <p>${records.length ? `${records.length.toLocaleString()} player-season records` : "Loading records"}</p>
                        </div>
                        <${Button}
                            label="Download CSV"
                            onClick=${() => downloadCsv(sortedData)}
                            isDisabled=${!sortedData.length}
                            variant="primary"
                            icon=${html`<${Icon} icon="arrowDown" size="sm" />`}
                        />
                    </div>

                    <div className="filter-toolbar">
                        <div className="search-control">
                            <${TextInput}
                                label="Search players"
                                isLabelHidden=${true}
                                value=${query}
                                onChange=${setQuery}
                                placeholder="Search players"
                                hasClear=${true}
                                width="100%"
                            />
                        </div>
                        <${MultiSelector}
                            label="Filter by season"
                            isLabelHidden=${true}
                            options=${seasonOptions}
                            value=${selectedSeasons}
                            onChange=${setSelectedSeasons}
                            placeholder="Season"
                            hasClear=${true}
                            hasSearch=${true}
                            triggerDisplay="labels"
                            formatValue=${(items) => items.length === 1 ? items[0].label : `${items.length} seasons`}
                            width=${155}
                        />
                        <${MultiSelector}
                            label="Filter by position"
                            isLabelHidden=${true}
                            options=${POSITION_OPTIONS}
                            value=${selectedPositions}
                            onChange=${setSelectedPositions}
                            placeholder="Position"
                            hasClear=${true}
                            triggerDisplay="labels"
                            width=${155}
                        />
                        <${Popover}
                            label="Filters"
                            alignment="end"
                            width="min(390px, calc(100vw - 32px))"
                            content=${html`
                                <${Filters}
                                    heightRanges=${selectedHeightRanges}
                                    ranges=${ranges}
                                    onHeightRangesChange=${setSelectedHeightRanges}
                                    onChange=${updateRange}
                                    onClear=${() => {
                                        setSelectedHeightRanges([]);
                                        setRanges(EMPTY_RANGES);
                                    }}
                                />
                            `}
                        >
                            <${Button}
                                label=${activeFilterCount ? `Filters, ${activeFilterCount}` : "Filters"}
                                icon=${html`<${Icon} icon="funnel" size="sm" />`}
                            />
                        </${Popover}>
                        <div className="toolbar-spacer"></div>
                        <span className="result-count" aria-live="polite">
                            ${filteredRecords.length.toLocaleString()} results
                        </span>
                        ${hasActiveFilters ? html`
                            <${Button} label="Clear all" variant="ghost" onClick=${clearAllFilters} />
                        ` : null}
                        <${MultiSelector}
                            label="Visible columns"
                            isLabelHidden=${true}
                            options=${COLUMN_OPTIONS}
                            value=${activeColumnKeys}
                            onChange=${updateColumns}
                            placeholder="View options"
                            hasSelectAll=${true}
                            triggerDisplay="count"
                            formatValue=${() => "View options"}
                            width=${150}
                        />
                    </div>

                    <${ActiveFilters}
                        query=${query}
                        seasons=${selectedSeasons}
                        positions=${selectedPositions}
                        heightRanges=${selectedHeightRanges}
                        ranges=${ranges}
                        clearHandlers=${clearHandlers}
                    />

                    ${loadError ? html`
                        <div className="load-state load-error" role="alert">
                            <h2>Unable to load the combine data</h2>
                            <p>${loadError}</p>
                        </div>
                    ` : null}
                    ${!loadError && !records.length ? html`
                        <div className="load-state" role="status">Loading combine data...</div>
                    ` : null}
                    ${records.length && !filteredRecords.length ? html`
                        <div className="load-state">
                            <h2>No players match these filters</h2>
                            <p>Clear one or more filters to broaden the results.</p>
                            <${Button} label="Clear all filters" onClick=${clearAllFilters} />
                        </div>
                    ` : null}
                    ${visibleRecords.length ? html`
                        <div className="table-scroll">
                            <div className="table-width">
                                <${Table}
                                    data=${visibleRecords}
                                    columns=${visibleColumns}
                                    idKey="id"
                                    plugins=${{sortable: sortablePlugin}}
                                    density="compact"
                                    dividers="rows"
                                    hasHover=${true}
                                    isStriped=${true}
                                    textOverflow="truncate"
                                />
                            </div>
                        </div>
                        <div className="pagination-row">
                            <span>${paginationSummary}</span>
                            <${Pagination}
                                page=${safePage}
                                onChange=${setPage}
                                totalItems=${sortedData.length}
                                pageSize=${pageSize}
                                pageSizeOptions=${[25, 50, 100]}
                                onPageSizeChange=${setPageSize}
                                siblingCount=${1}
                                label="Combine data pages"
                            />
                        </div>
                    ` : null}
                </section>
            </main>

            <footer className="site-footer">
                <p>
                    View the source code on${" "}
                    <a href="https://github.com/sdhutchins/nba-draft-combine-anthro">GitHub</a>.
                </p>
            </footer>
        </${Theme}>
    `;
}

createRoot(document.getElementById("root")).render(html`<${App} />`);
