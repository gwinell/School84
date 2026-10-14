# Security Policy

SchoolSphere is a self-hosted project. Keep installations behind TLS and a firewall, use unique production secrets, and restrict access to PostgreSQL, object storage, and the Python runner. The runner uses the Docker socket and must only be operated by a trusted host administrator.

## Reporting a vulnerability

Please do not publish exploitable details in a public issue or pull request. Use the repository's [private vulnerability report form](https://github.com/gwinell/School84/security/advisories/new) to report the issue to the maintainers.

Include the affected commit or version, impact, reproduction steps, and any practical mitigation. Do not send real student data, credentials, or secrets.

## Supported versions

Security fixes are currently developed against the default branch and its active pull requests. There is no separate release-support schedule yet.
