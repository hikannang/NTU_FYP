#!/bin/zsh

# Colors for output
autoload -U colors && colors
print -P "%F{green}Starting header/footer href update script...%f"

# Create backup
BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
print -P "%F{blue}Creating backup...%f"
mkdir -p "$BACKUP_DIR"
cp -r . "$BACKUP_DIR/"

# Update admin header/footer hrefs
print -P "%F{blue}Updating admin header/footer...%f"
find ./static/headerFooter -name "admin-*.html" -exec sed -i '' \
    -e 's|href="admin-|href="../../admin/|g' \
    -e 's|href="./admin-|href="../../admin/|g' \
    -e 's|href="../admin-|href="../../admin/|g' {} +

# Update user header/footer hrefs  
print -P "%F{blue}Updating user header/footer...%f"
find ./static/headerFooter -name "user-*.html" -exec sed -i '' \
    -e 's|href="user-|href="../../users/|g' \
    -e 's|href="./user-|href="../../users/|g' \
    -e 's|href="../user-|href="../../users/|g' {} +

# Verify changes
print -P "%F{blue}Checking for remaining incorrect hrefs...%f"
print -P "%F{yellow}Admin header/footer:%f"
grep -r "href=\"admin-" ./static/headerFooter/
grep -r "href=\"./admin-" ./static/headerFooter/
grep -r "href=\"../admin-" ./static/headerFooter/

print -P "%F{yellow}User header/footer:%f"
grep -r "href=\"user-" ./static/headerFooter/
grep -r "href=\"./user-" ./static/headerFooter/
grep -r "href=\"../user-" ./static/headerFooter/

print -P "%F{yellow}Backup saved in $BACKUP_DIR%f"
print -P "%F{green}Header/footer updates complete! Please check grep results above for any remaining issues.%f"