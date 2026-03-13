export function SkeletonRow({ cols = 1 }) {
    return (
        <div className="skeleton-row">
            {Array.from({ length: cols }).map((_, i) => (
                <div key={i} className="skeleton-cell" />
            ))}
        </div>
    );
}

export function SkeletonCard() {
    return (
        <div className="skeleton-card">
            <div className="skeleton-line skeleton-line-short" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-line-medium" />
        </div>
    );
}

export function SkeletonText({ lines = 3 }) {
    return (
        <div className="skeleton-text">
            {Array.from({ length: lines }).map((_, i) => (
                <div
                    key={i}
                    className="skeleton-line"
                    style={{ width: i === lines - 1 ? '60%' : '100%' }}
                />
            ))}
        </div>
    );
}
