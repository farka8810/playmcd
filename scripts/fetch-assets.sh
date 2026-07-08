#!/usr/bin/env bash
# Downloads the animated Tiny Swords sprites the game needs into
# public/assets/tiny/. These are by Pixel Frog (pixelfrog-assets.itch.io/tiny-swords),
# free for commercial use but NOT redistributable — hence not committed to this
# repo. Run this once after cloning: `bash scripts/fetch-assets.sh`
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/public/assets/tiny"
ART="https://raw.githubusercontent.com/ZieIony/TinySwords/main/Assets/Art"
BASE="$ART/Units"
mkdir -p "$DIR"

fetch() { echo "  $2"; curl -fsSL --retry 4 --retry-delay 2 -o "$DIR/$2" "$1"; }

echo "Fetching Tiny Swords sprites into public/assets/tiny/ …"
# Defenders: every royal archer rank shares the Blue Archer sheets (idle + shoot);
# rank is shown cosmetically at draw time (size/tint/aura/crown).
fetch "$BASE/Blue%20Units/Archer/Archer_Idle.png"      archer_idle.png
fetch "$BASE/Blue%20Units/Archer/Archer_Shoot.png"     archer_attack.png
# Raiders: the Red horde besieging the wall (run cycle).
fetch "$BASE/Red%20Units/Pawn/Pawn_Run.png"            red_pawn_run.png
fetch "$BASE/Red%20Units/Warrior/Warrior_Run.png"      red_warrior_run.png
fetch "$BASE/Red%20Units/Archer/Archer_Run.png"        red_archer_run.png
fetch "$BASE/Red%20Units/Lancer/Lancer_Run.png"        red_lancer_run.png
# Terrain: grass tilemap + decorations for the pixel field background.
fetch "$ART/Terrain/Tileset/Tilemap_color1.png"       tilemap.png
fetch "$ART/Terrain/Decorations/Trees/Tree1.png"      tree.png
fetch "$ART/Terrain/Decorations/Bushes/Bushe1.png"    bush1.png
fetch "$ART/Terrain/Decorations/Bushes/Bushe3.png"    bush2.png
fetch "$ART/Terrain/Decorations/Rocks/Rock1.png"      rock1.png
fetch "$ART/Terrain/Decorations/Rocks/Rock3.png"      rock2.png
fetch "$ART/Terrain/Decorations/Clouds/Clouds_02.png" cloud1.png
fetch "$ART/Terrain/Decorations/Clouds/Clouds_07.png" cloud2.png
echo "Done."
