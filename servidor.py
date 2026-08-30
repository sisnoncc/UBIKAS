import subprocess
import webbrowser
import os

# Puerto configurado
PUERTO = 8000
URL = f"http://localhost:{PUERTO}/index.html"

print(f"[*] Iniciando servidor local en el puerto {PUERTO}...")
print(f"[*] Abriendo navegador en: {URL}")

# Abre el navegador automáticamente (opcional)
webbrowser.open(URL)

try:
    # Ejecuta el comando en PowerShell usando subprocess
    subprocess.run(["powershell", "-Command", f"py -m http.server {PUERTO}"], check=True)
except KeyboardInterrupt:
    print("\n[*] Servidor detenido por el usuario.")