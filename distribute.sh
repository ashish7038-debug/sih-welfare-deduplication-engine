#!/bin/bash

###############################################################################
# distribute.sh - Team Branch Synchronization Script
# 
# Purpose: Pushes the local 'main' branch to all team member branches,
#          ensuring approved changes are distributed to all team members.
# 
# Usage: ./distribute.sh
#
# Team Member Branches:
#   - member1-dev
#   - member2-frontend
#   - member3-auth
#   - member4-db
#   - member5-ui
#   - member6-tests
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Define team member branches
TEAM_BRANCHES=(
    "member1-dev"
    "member2-frontend"
    "member3-auth"
    "member4-db"
    "member5-ui"
    "member6-tests"
)

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verify git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    log_error "Not a git repository. Exiting."
    exit 1
fi

# Verify we're on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    log_warning "Currently on branch: $CURRENT_BRANCH"
    log_info "Switching to main branch..."
    git checkout main
fi

# Fetch latest changes
log_info "Fetching latest changes from remote..."
git fetch origin

# Pull latest main
log_info "Pulling latest changes from origin/main..."
git pull origin main

echo ""
log_info "Starting distribution to $(echo ${#TEAM_BRANCHES[@]}) team member branches..."
echo ""

# Counter for tracking results
PUSHED=0
FAILED=0

# Push main to each team member branch
for BRANCH in "${TEAM_BRANCHES[@]}"; do
    log_info "Pushing main → $BRANCH"
    
    if git push origin main:"$BRANCH"; then
        log_success "Pushed to: $BRANCH"
        ((PUSHED++))
    else
        log_error "Failed to push to: $BRANCH"
        ((FAILED++))
    fi
done

echo ""
log_info "Distribution Summary:"
echo "  Successfully pushed to: $PUSHED branch(es)"
if [ $FAILED -gt 0 ]; then
    echo "  Failed pushes:         $FAILED branch(es)"
fi

if [ $FAILED -eq 0 ]; then
    log_success "All team branches updated successfully!"
    exit 0
else
    log_error "$FAILED branch(es) failed to update."
    exit 1
fi
