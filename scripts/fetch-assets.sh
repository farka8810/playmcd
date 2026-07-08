#!/usr/bin/env bash
# Downloads the animated Tiny Swords sprites the game needs into
# public/assets/tiny/. These are by Pixel Frog (pixelfrog-assets.itch.io/tiny-swords),
# free for commercial use but NOT redistributable — hence not committed to this
# repo. Run this once after cloning: `bash scripts/fetch-assets.sh`
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/public/assets/tiny"
BASE="https://raw.githubusercontent.com/ZieIony/TinySwords/main/Assets/Art/Units"
mkdir -p "$DIR"

fetch() { echo "  $2"; curl -fsSL --retry 4 --retry-delay 2 -o "$DIR/$2" "$1"; }

echo "Fetching Tiny Swords sprites into public/assets/tiny/ …"
fetch "$BASE/Blue%20Units/Pawn/Pawn_Idle.png"          pawn_idle.png
fetch "$BASE/Blue%20Units/Archer/Archer_Idle.png"      archer_idle.png
fetch "$BASE/Blue%20Units/Archer/Archer_Shoot.png"     archer_attack.png
fetch "$BASE/Blue%20Units/Monk/Idle.png"               monk_idle.png
fetch "$BASE/Blue%20Units/Lancer/Lancer_Idle.png"      lancer_idle.png
fetch "$BASE/Blue%20Units/Warrior/Warrior_Idle.png"    warrior_idle.png
fetch "$BASE/Blue%20Units/Warrior/Warrior_Attack1.png" warrior_attack.png
fetch "$BASE/Red%20Units/Pawn/Pawn_Run.png"            red_pawn_run.png
fetch "$BASE/Red%20Units/Warrior/Warrior_Run.png"      red_warrior_run.png
fetch "$BASE/Red%20Units/Archer/Archer_Run.png"        red_archer_run.png
fetch "$BASE/Red%20Units/Lancer/Lancer_Run.png"        red_lancer_run.png
echo "Done."
