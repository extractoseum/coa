#!/usr/bin/env python3
"""
Detector de valores hardcodeados en el sistema COA Viewer 2.0
Busca: URLs, IDs, keys, tokens, números de teléfono, emails, etc.
"""

import os
import re
import json
from pathlib import Path
from collections import defaultdict

# Patrones a detectar
PATTERNS = {
    'api_url': r'https?://[a-zA-Z0-9.-]+\.(com|io|co|net|org|app|online)[^\s\'"]*',
    'supabase_url': r'https://[a-zA-Z0-9]+\.supabase\.co',
    'api_key': r'(api[_-]?key|apikey)\s*[=:]\s*["\']?[a-zA-Z0-9_-]{20,}',
    'secret_key': r'(secret|private)[_-]?(key)?\s*[=:]\s*["\']?[a-zA-Z0-9_-]{20,}',
    'bearer_token': r'Bearer\s+[a-zA-Z0-9_.-]+',
    'phone_mx': r'\+?52\s*\d{2,3}\s*\d{3,4}\s*\d{4}',
    'phone_us': r'\+?1\s*\(?\d{3}\)?\s*\d{3}[-\s]?\d{4}',
    'email': r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
    'shopify_domain': r'[a-zA-Z0-9-]+\.myshopify\.com',
    'google_id': r'G-[A-Z0-9]{10}',
    'clarity_id': r'[a-z0-9]{10,12}',  # Microsoft Clarity
    'onesignal_id': r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}',
    'whapi_token': r'whapi[_-]?token\s*[=:]\s*["\']?[a-zA-Z0-9_-]+',
    'hardcoded_price': r'(precio|price|costo)\s*[=:]\s*\d+',
    'hardcoded_port': r'port\s*[=:]\s*\d{4,5}',
    'localhost': r'localhost:\d+|127\.0\.0\.1:\d+',
    'aws_key': r'AKIA[0-9A-Z]{16}',
    'stripe_key': r'(sk|pk)_(test|live)_[a-zA-Z0-9]+',
    'jwt_token': r'eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+',
    'base64_long': r'[A-Za-z0-9+/]{50,}={0,2}',
    'hex_string': r'["\'][0-9a-fA-F]{32,}["\']',
}

# Archivos/carpetas a ignorar
IGNORE_DIRS = {
    'node_modules', '.git', 'dist', 'build', '.next', 
    'coverage', '__pycache__', '.cache', 'android/app/build',
    'ios/Pods', 'ASSETS_BRAND', '.claude'
}

IGNORE_FILES = {
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    '.env.example', 'detect_hardcoded.py'
}

# Extensiones a escanear
SCAN_EXTENSIONS = {
    '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.html', 
    '.css', '.scss', '.env', '.yaml', '.yml', '.xml', '.gradle'
}

# Valores que están OK (en .env o son públicos)
ALLOWED_PATTERNS = {
    'import.meta.env',
    'process.env',
    'VITE_',
    'example.com',
    'placeholder',
    'your-',
    'xxx',
    'TODO',
}

def should_scan_file(filepath):
    """Determina si un archivo debe ser escaneado"""
    path = Path(filepath)
    
    # Ignorar directorios
    for ignore_dir in IGNORE_DIRS:
        if ignore_dir in path.parts:
            return False
    
    # Ignorar archivos específicos
    if path.name in IGNORE_FILES:
        return False
    
    # Solo escanear extensiones relevantes
    if path.suffix not in SCAN_EXTENSIONS and path.name not in ['.env', '.env.local', '.env.production']:
        return False
    
    return True

def is_allowed(match, line):
    """Verifica si un match está permitido"""
    for allowed in ALLOWED_PATTERNS:
        if allowed.lower() in line.lower():
            return True
    return False

def scan_file(filepath):
    """Escanea un archivo en busca de valores hardcodeados"""
    findings = []
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
    except:
        return findings
    
    for line_num, line in enumerate(lines, 1):
        # Ignorar comentarios
        stripped = line.strip()
        if stripped.startswith('//') or stripped.startswith('#') or stripped.startswith('*'):
            continue
            
        for pattern_name, pattern in PATTERNS.items():
            matches = re.findall(pattern, line, re.IGNORECASE)
            for match in matches:
                if isinstance(match, tuple):
                    match = match[0]
                
                # Filtrar matches permitidos
                if is_allowed(match, line):
                    continue
                
                # Filtrar matches muy cortos o genéricos
                if len(str(match)) < 8:
                    continue
                    
                findings.append({
                    'file': filepath,
                    'line': line_num,
                    'type': pattern_name,
                    'match': str(match)[:100],
                    'context': line.strip()[:150]
                })
    
    return findings

def main():
    print("🔍 DETECTOR DE VALORES HARDCODEADOS")
    print("=" * 60)
    
    base_path = Path('.')
    all_findings = defaultdict(list)
    files_scanned = 0
    
    # Escanear todos los archivos
    for root, dirs, files in os.walk(base_path):
        # Filtrar directorios a ignorar
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        
        for file in files:
            filepath = os.path.join(root, file)
            
            if not should_scan_file(filepath):
                continue
            
            files_scanned += 1
            findings = scan_file(filepath)
            
            for finding in findings:
                all_findings[finding['type']].append(finding)
    
    print(f"\n📁 Archivos escaneados: {files_scanned}")
    print(f"⚠️  Hallazgos totales: {sum(len(v) for v in all_findings.values())}")
    print("\n" + "=" * 60)
    
    # Agrupar por tipo y severidad
    severity_order = {
        'api_key': 1, 'secret_key': 1, 'aws_key': 1, 'stripe_key': 1,
        'jwt_token': 2, 'bearer_token': 2, 'whapi_token': 2,
        'supabase_url': 3, 'api_url': 3, 'shopify_domain': 3,
        'phone_mx': 4, 'phone_us': 4, 'email': 4,
        'google_id': 5, 'clarity_id': 5, 'onesignal_id': 5,
        'localhost': 6, 'hardcoded_port': 6,
        'hardcoded_price': 7,
        'base64_long': 8, 'hex_string': 8
    }
    
    sorted_types = sorted(all_findings.keys(), key=lambda x: severity_order.get(x, 99))
    
    for pattern_type in sorted_types:
        findings = all_findings[pattern_type]
        if not findings:
            continue
            
        severity = severity_order.get(pattern_type, 99)
        icon = "🔴" if severity <= 2 else "🟠" if severity <= 4 else "🟡" if severity <= 6 else "⚪"
        
        print(f"\n{icon} {pattern_type.upper()} ({len(findings)} encontrados)")
        print("-" * 50)
        
        # Deduplicar por archivo
        seen = set()
        for f in findings[:10]:  # Limitar a 10 por tipo
            key = (f['file'], f['match'])
            if key in seen:
                continue
            seen.add(key)
            
            rel_path = os.path.relpath(f['file'])
            print(f"  📄 {rel_path}:{f['line']}")
            print(f"     → {f['match'][:80]}...")
    
    # Resumen
    print("\n" + "=" * 60)
    print("📊 RESUMEN POR SEVERIDAD")
    print("-" * 30)
    
    critical = sum(len(all_findings[t]) for t in all_findings if severity_order.get(t, 99) <= 2)
    high = sum(len(all_findings[t]) for t in all_findings if 2 < severity_order.get(t, 99) <= 4)
    medium = sum(len(all_findings[t]) for t in all_findings if 4 < severity_order.get(t, 99) <= 6)
    low = sum(len(all_findings[t]) for t in all_findings if severity_order.get(t, 99) > 6)
    
    print(f"🔴 Crítico (keys/secrets): {critical}")
    print(f"🟠 Alto (tokens/URLs): {high}")
    print(f"🟡 Medio (localhost/ports): {medium}")
    print(f"⚪ Bajo (otros): {low}")
    
    # Guardar reporte JSON
    report = {
        'files_scanned': files_scanned,
        'total_findings': sum(len(v) for v in all_findings.values()),
        'by_type': {k: len(v) for k, v in all_findings.items()},
        'findings': dict(all_findings)
    }
    
    with open('hardcoded_report.json', 'w') as f:
        json.dump(report, f, indent=2, default=str)
    
    print(f"\n💾 Reporte guardado en: hardcoded_report.json")

if __name__ == '__main__':
    main()
