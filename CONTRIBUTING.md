# Contributing to NeuroFocus

Thank you for your interest in contributing! This document outlines the process for contributing to NeuroFocus.

## Code of Conduct

Be respectful, constructive, and inclusive in all interactions.

## How to Contribute

### Reporting Bugs

1. Check if the issue already exists
2. Open a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser/device info
   - Screenshots if applicable

### Suggesting Features

1. Open an issue with the "enhancement" label
2. Describe the feature and its use case
3. Discuss implementation approach

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Run linter: `npm run lint`
6. Commit with clear messages
7. Push and open a Pull Request

## Development Setup

```bash
git clone https://github.com/shikaruki0/neurofocus.git
cd neurofocus
npm install
npm run dev
```

## Code Style

- Use meaningful variable/function names
- Keep functions small and focused
- Comment complex logic
- Follow existing patterns
- Run `npm run lint:fix` before committing

## Commit Message Format

```
type(scope): description

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Example: `feat(focus): add 90-minute flow state mode`

## Testing

- Write unit tests for new features
- Ensure all tests pass before submitting
- Aim for meaningful coverage, not just numbers

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
