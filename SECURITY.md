"# Security Policy

## Supported Versions

| Version | Supported |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in `bws-vault-bridge`, please report it privately.

1.  **Email:** Send an email to [YOUR_EMAIL_ADDRESS] (replace with a generic security email or your own if comfortable, or instruct to use GitHub Security Advisories if enabled).
    *   *Alternative:* If this repository has **Private Vulnerability Reporting** enabled, please use that feature under the \"Security\" tab.

2.  **What to Include:**
    *   Description of the vulnerability.
    *   Steps to reproduce.
    *   Potential impact.

3.  **Response:**
    *   We will acknowledge receipt of your report within 48 hours.
    *   We will provide a timeline for fixing the vulnerability.

## Security Constraints

This project is designed with the following constraints. Bypassing them is considered a vulnerability:

*   **No logging of secrets:** `key`, `value`, or `BWS_ACCESS_TOKEN` must never appear in logs.
*   **Fail-fast authentication:** The service must exit if the Bitwarden SDK loses state or fails to authenticate.
*   **Opaque Errors:** Stack traces from the SDK must not be returned to the client.
"