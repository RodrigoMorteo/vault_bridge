"# Contributing to bws-vault-bridge

Thank you for your interest in contributing to **bws-vault-bridge**! We welcome contributions from the community.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/YOUR_USERNAME/bws-vault-bridge.git
    cd bws-vault-bridge
    ```
3.  **Install dependencies** (ensure you are using the correct Node.js LTS version):
    ```bash
    source ~/.nvm/nvm.sh && nvm use --lts
    npm install
    ```
4.  **Create a new branch** for your feature or bugfix:
    ```bash
    git checkout -zb feature/my-new-feature
    ```

## Development Workflow

### Testing
All changes must be verified by tests. This project uses **Jest** and **Supertest**.

To run the test suite:
```bash
npm test
```
*   Ensure all existing tests pass.
*   **New features must include new tests.**
*   **Bug fixes must include a regression test.**

### Coding Standards
*   Keep the code minimal and security-focused.
*   **Do not introduce external dependencies unless absolutely necessary.**
*   Follow the existing code style (standard JS formatting).
*   **Security First:** Never log secrets. Always fail fast on auth errors.

## submitting a Pull Request (PR)

1.  Push your branch to your fork:
    ```bash
    git push origin feature/my-new-feature
    ```
2.  Open a Pull Request against the `main` branch of the upstream repository.
3.  Fill out the PR template (if available) or describe your changes clearly.
4.  Link to any relevant issues (e.g., `Fixes #123`).
5.  Wait for a review. We may ask for changes before merging.

## Code of Conduct
Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## License
By contributing to **bws-vault-bridge**, you agree that your contributions will be licensed under its [Apache License 2.0](LICENSE).
"