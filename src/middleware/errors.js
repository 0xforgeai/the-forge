import logger from '../logger.js';

/**
 * Global error handler middleware.
 */
export function errorHandler(err, req, res, _next) {
    const status = err.status || 500;
    const message = status === 500 ? 'Internal server error' : err.message;

    logger.error(
        {
            err,
            method: req.method,
            url: req.url,
            status,
        },
        'Request error'
    );

    res.status(status).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
}

/**
 * 404 handler.
 */
export function notFoundHandler(req, res) {
    res.status(404).json({ error: `Route ${req.method} ${req.url} not found.` });
}
