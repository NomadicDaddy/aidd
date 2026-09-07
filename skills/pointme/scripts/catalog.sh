#!/usr/bin/env bash
# pointme catalog builder.
# Emits the routing inputs for one goal: resolved context, the agent skill catalog,
# and the aidd recipe catalog when an aidd root is reachable.
# Usage: catalog.sh [project-dir]
set -u

proj="${1:-$PWD}"
[ -d "$proj" ] || proj="$PWD"

# ---------- context ----------
is_aidd() { [ -d "$1/recipes" ] && [ -d "$1/skills" ] && [ -d "$1/audits" ]; }
find_aidd_root() {
	local start d
	for start in "${AIDD_ROOT:-}" "$proj" "$PWD"; do
		[ -n "$start" ] || continue
		d="$start"
		for _ in 1 2 3 4 5; do
			is_aidd "$d" && { (cd "$d" && pwd); return 0; }
			is_aidd "$d/aidd" && { (cd "$d/aidd" && pwd); return 0; }
			[ "$d" = "/" ] && break
			d="$(dirname "$d")"
		done
	done
	return 1
}
aidd_root="$(find_aidd_root || true)"
feature_count="$(
	find "$proj/.aidd/features" -mindepth 1 -maxdepth 1 -type d 2>/dev/null |
		wc -l |
		tr -d ' '
)"

echo "## context"
printf 'cwd\t%s\n' "$(cd "$proj" && pwd)"
printf 'aidd-root\t%s\n' "${aidd_root:-none}"
printf 'staged-aidd\t%s\n' "$([ -d "$proj/.aidd" ] && echo yes || echo no)"
printf 'features\t%s\n' "$feature_count"
printf 'git-dirty\t%s\n' "$(git -C "$proj" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

# ---------- agent skills ----------
echo
echo "## skills (source, id, category, description)"
codex_home="${CODEX_HOME:-$HOME/.codex}"
roots=()
[ -d "$codex_home/skills" ] && roots+=("$codex_home/skills|user")
[ -d "$codex_home/skills/.system" ] && roots+=("$codex_home/skills/.system|system")
[ -d "$HOME/.claude/skills" ] && roots+=("$HOME/.claude/skills|user")
[ -d "$proj/.claude/skills" ] && roots+=("$proj/.claude/skills|project")
[ -n "$aidd_root" ] && [ "$aidd_root/skills" != "$HOME/.claude/skills" ] && roots+=("$aidd_root/skills|aidd")
for plugin_home in "$codex_home/plugins" "$HOME/.claude/plugins"; do
	while IFS= read -r d; do
		[ -n "$d" ] && roots+=("$d|plugin")
	done < <(find "$plugin_home" -maxdepth 6 -type d -name skills 2>/dev/null)
done

if [ ${#roots[@]} -gt 0 ]; then
	for entry in "${roots[@]}"; do
		dir="${entry%|*}"; src="${entry##*|}"
		for f in "$dir"/*/SKILL.md; do
			[ -f "$f" ] || continue
			awk -v src="$src" -v path="$f" '
				BEGIN { fm=0; name=""; desc=""; cat=""; indesc=0 }
				/^---[[:space:]]*$/ { fm++; if (fm==2) exit; next }
				fm==1 {
					if ($0 ~ /^description:/) {
						v=$0; sub(/^description:[[:space:]]*/,"",v)
						if (v==">-"||v==">"||v=="|"||v=="|-") desc=""; else desc=v
						indesc=1; next
					}
					if (indesc && $0 ~ /^[[:space:]]+[^[:space:]]/) {
						v=$0; sub(/^[[:space:]]+/,"",v); desc=(desc==""?v:desc" "v); next
					}
					indesc=0
					if ($0 ~ /^name:/) { name=$0; sub(/^name:[[:space:]]*/,"",name) }
					if ($0 ~ /^[[:space:]]*aidd-category:/) { cat=$0; sub(/^[[:space:]]*aidd-category:[[:space:]]*/,"",cat) }
				}
			END {
				if (name=="") { n=split(path,p,"/"); name=p[n-1] }
				gsub(/^["'"'"']|["'"'"']$/,"",name)
				gsub(/^["'"'"']|["'"'"']$/,"",cat)
				gsub(/^["'"'"']|["'"'"']$/,"",desc); gsub(/[\t\r]/," ",desc)
					if (cat=="") cat="-"
					printf "%s\t%s\t%s\t%s\n", src, name, cat, desc
				}
			' "$f"
		done
	done | sort -u -t"$(printf '\t')" -k2,2
fi

# ---------- aidd recipes ----------
if [ -z "$aidd_root" ]; then
	exit 0
fi

echo
echo "## recipes (id, name, params, steps, step-skills, description)"

emit_recipes_jq() {
	for f in "$aidd_root"/recipes/*.json; do
		[ -f "$f" ] || continue
		id="$(basename "$f" .json)"
		jq -r --arg id "$id" '
			[ $id,
			  (.name // $id),
			  ((.parameters // []) | map(.name) | join(",") | if . == "" then "-" else . end),
			  ((.steps // []) | length | tostring),
			  ((.steps // []) | map(.configJson.skillId // empty) | unique | join(",") | if . == "" then "-" else . end),
			  ((.description // "-") | gsub("[\t\r\n]"; " "))
			] | @tsv' "$f"
	done
}

emit_recipes_bun() {
	bun -e '
		const { readdirSync, readFileSync } = require("node:fs");
		const dir = process.argv[1];
		for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
			const r = JSON.parse(readFileSync(dir + "/" + f, "utf8"));
			const id = f.slice(0, -5);
			const steps = Array.isArray(r.steps) ? r.steps : [];
			const skills = [...new Set(steps.map((s) => s?.configJson?.skillId).filter(Boolean))];
			console.log([
				id,
				r.name || id,
				(r.parameters || []).map((p) => p.name).join(",") || "-",
				String(steps.length),
				skills.join(",") || "-",
				(r.description || "-").replace(/[\t\r\n]+/g, " "),
			].join("\t"));
		}
	' "$aidd_root/recipes"
}

if command -v jq >/dev/null 2>&1; then
	emit_recipes_jq
elif command -v bun >/dev/null 2>&1; then
	emit_recipes_bun
else
	echo "(neither jq nor bun available — read $aidd_root/recipes/*.json directly)"
fi
