#!/usr/bin/env python3
"""Script to revert theme changes in COADetails.tsx"""

import re

# Read the file
with open('frontend/src/pages/COADetails.tsx', 'r') as f:
    content = f.read()

# Remove theme imports
content = re.sub(r"import \{ useTheme \} from '../contexts/ThemeContext';\n", '', content)
content = re.sub(r"import ThemeSelector from '../components/ThemeSelector';\n", '', content)

# Remove useTheme hook usage
content = re.sub(r"\s*const \{ colors \} = useTheme\(\);", '', content)

# Replace colors with hardcoded dark theme values
replacements = {
    'colors.bgPrimary': "'#0a0e1a'",
    'colors.bgSecondary': "'#111827'",
    'colors.bgCard': "'#1f2937'",
    'colors.bgCardHover': "'#374151'",
    'colors.border': "'#374151'",
    'colors.borderLight': "'#4b5563'",
    'colors.textPrimary': "'#ffffff'",
    'colors.textSecondary': "'#d1d5db'",
    'colors.textTertiary': "'#9ca3af'",
    'colors.accent': "'#10b981'",
    'colors.accentHover': "'#059669'",
    'colors.accentText': "'#10b981'",
    'colors.success': "'#10b981'",
    'colors.successBg': "'#064e3b'",
    'colors.error': "'#ef4444'",
    'colors.errorBg': "'#7f1d1d'",
    'colors.warning': "'#f59e0b'",
    'colors.warningBg': "'#78350f'"
}

for old, new in replacements.items():
    content = content.replace(old, new)

# Remove ThemeSelector component usage
content = re.sub(r'<ThemeSelector />', '', content)

# Write back
with open('frontend/src/pages/COADetails.tsx', 'w') as f:
    f.write(content)

print("✅ Theme changes reverted successfully!")
print("The file has been restored to use hardcoded dark theme colors.")
