#!/bin/bash
# Si erreur "permission refusée" : ouvrir Terminal, taper : chmod +x LANCER.command
cd "$(dirname "$0")"
open -a "Google Chrome" --args --allow-file-access-from-files "$(pwd)/index.html"
