#!/bin/bash

###############################################################################
# distribute.sh - Automated Branch Synchronization Script
# 
# Purpose: Synchronizes approved changes from main branch into all team
#          member branches, ensuring consistency across the codebase.
# 
# Usage: ./distribute.sh [--dry-run] [--branch <branch-name>]
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MAIN_BRANCH="main"
DRY_RUN=false
TARGET_BRANCH=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            echo -e "${YELLOW}[DRY RUN MODE]${NC} No changes will be committed or pushed"
            shift
            ;;
        --branch)
            TARGET_BRANCH="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

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

# Fetch latest changes from remote
log_info "Fetching latest changes from remote..."
git fetch origin

# Get list of team branches (exclude main and protected branches)
log_info "Identifying team branches..."
TEAM_BRANCHES=$(git branch -r | grep "origin/" | grep -v "origin/$MAIN_BRANCH" | grep -v "origin/HEAD" | sed 's|origin/||' | sort)

if [ -z "$TEAM_BRANCHES" ]; then
    log_warning "No team branches found to synchronize."
    exit 0
fi

# Filter by target branch if specified
if [ -n "$TARGET_BRANCH" ]; then
    if echo "$TEAM_BRANCHES" | grep -q "^$TARGET_BRANCH$"; then
        TEAM_BRANCHES="$TARGET_BRANCH"
        log_info "Synchronizing only branch: $TARGET_BRANCH"
    else
        log_error "Branch '$TARGET_BRANCH' not found."
        exit 1
    fi
fi

log_info "Found $(echo "$TEAM_BRANCHES" | wc -l) branch(es) to synchronize:"
echo "$TEAM_BRANCHES" | sed 's/^/  - /'

# Store current branch to restore later
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Counter for tracking results
SYNCED=0
FAILED=0
SKIPPED=0

# Synchronize each team branch
echo ""
log_info "Starting synchronization process..."
echo ""

while IFS= read -r BRANCH; do
    log_info "Processing: $BRANCH"
    
    # Check out the branch
    if ! git checkout -q "origin/$BRANCH" -b "sync_$BRANCH" 2>/dev/null; then
        git checkout -q "$BRANCH" 2>/dev/null || git checkout -q "origin/$BRANCH" 2>/dev/null
    fi
    
    # Try to merge main into this branch
    if git merge --no-commit --no-ff "origin/$MAIN_BRANCH" > /dev/null 2>&1; then
        if $DRY_RUN; then
            log_warning "Would merge main → $BRANCH (DRY RUN)"
            git merge --abort
            ((SKIPPED++))
        else
            # Commit the merge
            git commit -m "chore: merge main branch updates into $BRANCH" --quiet || {
                log_warning "No changes to commit for $BRANCH"
                git merge --abort
                ((SKIPPED++))
                continue
            }
            
            # Push the changes
            if git push -q origin "HEAD:$BRANCH"; then
                log_success "Synchronized: $BRANCH"
                ((SYNCED++))
            else
                log_error "Failed to push: $BRANCH"
                git merge --abort
                ((FAILED++))
            fi
        fi
    else
        # Merge conflict detected
        log_warning "Merge conflict detected in $BRANCH"
        log_info "  - Manual intervention required for: $BRANCH"
        git merge --abort
        ((FAILED++))
    fi
    
    # Return to the correct branch for next iteration
    git checkout -q "$MAIN_BRANCH" 2>/dev/null || git checkout -q "origin/$MAIN_BRANCH" 2>/dev/null
done <<< "$TEAM_BRANCHES"

echo ""
log_info "Synchronization Summary:"
echo "  Synced:  $SYNCED"
echo "  Failed:  $FAILED"
echo "  Skipped: $SKIPPED"

# Restore original branch
if [ "$CURRENT_BRANCH" != "HEAD" ]; then
    git checkout -q "$CURRENT_BRANCH" 2>/dev/null || true
fi

if [ $FAILED -eq 0 ]; then
    log_success "All branches synchronized successfully!"
    exit 0
else
    log_error "$FAILED branch(es) had conflicts or issues."
    exit 1
fi
