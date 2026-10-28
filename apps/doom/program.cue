@extern(embed)

package doom

import (
	"list"

	pronto "bonisoft.org/plugins/pronto"
)

_designMd: _ @embed(file="DESIGN.md", type=text)
_arenaMarkup: #"""
<div class="screen" data-screen="arena" data-theme="terminal">
  <div class="arena-frame">
    <div class="viewport-box">
      <canvas id="renderCanvas" aria-label="Arena 3D Viewport"></canvas>
      
      <ul class="frag-feed" data-live="frag" data-order="tick.desc" aria-live="polite">
        <template data-item>
          <li class="frag-entry">
            <span class="killer" data-text="{killer}">Slayer</span>
            <span class="weapon-badge" data-text="{weapon}">SSG</span>
            <span class="victim" data-text="{victim}">Zombie</span>
          </li>
        </template>
      </ul>

      <div class="match-notice" data-live="match" data-filter="id=eq.match-01" data-status="{status}" data-empty-row='{"id":"match-01","map":"e1m1","status":"warmup","frag_limit":10,"frags_us":0,"frags_them":0,"winner":""}'>
        <span class="status-pill" data-text="{status}">WARMUP</span>
        <span class="score-pill">NÓS: <b data-text="{frags_us}">0</b> · ELES: <b data-text="{frags_them}">0</b></span>
        <button type="button" id="btn-start" class="act" data-on-click="match_control">Iniciar</button>
      </div>

      <div class="overlay-game-over" data-live="match" data-filter="id=eq.match-01" data-empty-row='{"id":"match-01","map":"e1m1","status":"warmup","frag_limit":10,"frags_us":0,"frags_them":0,"winner":""}'>
        <h2 class="title-over">FIM DE COMBATE</h2>
        <p class="winner-text">Vencedor: <b data-text="{winner}">NÓS</b></p>
        <button type="button" id="btn-rematch" class="act hot" data-on-click="match_control">Outra Partida</button>
      </div>
    </div>

    <footer class="doom-hud" data-live="player" data-filter="id=eq.player-local" data-reads="match" data-empty-row='{"id":"player-local","handle":"Doomguy","health":100,"armor":50,"ammo":50,"weapon":"shotgun","in_pain":"false","is_god":"false","health_tier":"healthy"}'>
      <div class="hud-block ammo-block">
        <span class="hud-label">MUNIÇÃO</span>
        <span class="hud-value digital" data-text="{ammo}">50</span>
      </div>

      <div class="hud-block health-block" data-tier="{health_tier}">
        <span class="hud-label">VIDA</span>
        <span class="hud-value digital" data-text="{health}">100%</span>
      </div>

      <div class="hud-face-block">
        <div class="doomguy-face"
             data-tier="{health_tier}"
             data-pain="{in_pain}"
             data-god="{is_god}">
          <div class="face-eye left"></div>
          <div class="face-eye right"></div>
          <div class="face-mouth"></div>
        </div>
      </div>

      <div class="hud-block armor-block">
        <span class="hud-label">ARMADURA</span>
        <span class="hud-value digital" data-text="{armor}">50%</span>
      </div>

      <div class="hud-block arms-block">
        <span class="hud-label">ARMAS</span>
        <div class="arms-grid">
          <span class="arm-slot active" data-has="2">2</span>
          <span class="arm-slot active" data-has="3">3</span>
          <span class="arm-slot" data-has="4">4</span>
          <span class="arm-slot" data-has="5">5</span>
          <span class="arm-slot" data-has="6">6</span>
          <span class="arm-slot" data-has="7">7</span>
        </div>
      </div>

      <div class="hud-actions">
        <a class="act ghost" data-route="lobby">Configurar</a>
      </div>
    </footer>
  </div>
</div>
"""#

_lobbyMarkup: #"""
<div class="screen" data-screen="lobby" data-theme="terminal" data-live="match" data-filter="id=eq.match-01">
  <div class="lobby-card">
    <h1 class="lobby-title">UAC PHOBOS ARENA</h1>
    <p class="lobby-desc">Configuração do Fuzileiro & Parâmetros de Combate</p>

    <div class="lobby-form">
      <div class="form-field">
        <label for="input-handle">Nome do Fuzileiro</label>
        <input type="text" id="input-handle" name="handle" value="Doomguy" maxlength="16" readonly>
      </div>

      <div class="form-field">
        <label for="select-frags">Limite de Frags</label>
        <input type="text" id="select-frags" value="10 Frags (Padrão)" readonly>
      </div>

      <div class="lobby-actions">
        <a class="act hot" data-route="arena" data-on-click="enter_arena">Entrar na Arena</a>
      </div>
    </div>
  </div>
</div>
"""#

code: pronto.#App & {
	state: {
		entities: {
			Match: {
				id: "0x8122334455667788"
				table: "match"
				durability: "tab"
				seed: [{
					id: "match-01"
					map: "e1m1"
					status: "warmup"
					frag_limit: 10
					frags_us: 0
					frags_them: 0
					winner: ""
				}]
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 64"},
					{ordinal: 2, name: "map", type: "string", cel: "this in ['e1m1', 'e1m2']"},
					{ordinal: 3, name: "status", type: "string", cel: "this in ['warmup', 'active', 'over']"},
					{ordinal: 4, name: "frag_limit", type: "int32", cel: "this >= 1 && this <= 100"},
					{ordinal: 5, name: "frags_us", type: "int32", cel: "this >= 0"},
					{ordinal: 6, name: "frags_them", type: "int32", cel: "this >= 0"},
					{ordinal: 7, name: "winner", type: "string", required: false, cel: "this.size() <= 32"}
				]
			}
			Player: {
				id: "0x8233445566778899"
				table: "player"
				durability: "tab"
				seed: [{
					id: "player-local"
					handle: "Doomguy"
					health: 100
					armor: 50
					ammo: 50
					weapon: "shotgun"
					in_pain: "false"
					is_god: "false"
					health_tier: "healthy"
				}]
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 64"},
					{ordinal: 2, name: "handle", type: "string", cel: "this.size() <= 16"},
					{ordinal: 3, name: "health", type: "int32", cel: "this >= 0 && this <= 200"},
					{ordinal: 4, name: "armor", type: "int32", cel: "this >= 0 && this <= 200"},
					{ordinal: 5, name: "ammo", type: "int32", cel: "this >= 0 && this <= 999"},
					{ordinal: 6, name: "weapon", type: "string", cel: "this in ['fist', 'pistol', 'shotgun', 'chaingun', 'rocket']"},
					{ordinal: 7, name: "in_pain", type: "string", cel: "this in ['true', 'false']"},
					{ordinal: 8, name: "is_god", type: "string", cel: "this in ['true', 'false']"},
					{ordinal: 9, name: "health_tier", type: "string", cel: "this in ['healthy', 'scratched', 'bloody', 'critical', 'dead']"}
				]
			}
			Frag: {
				id: "0x83445566778899aa"
				table: "frag"
				durability: "tab"
				fields: [
					{ordinal: 1, name: "id", type: "string", pk: true, cel: "this.size() <= 64"},
					{ordinal: 2, name: "killer", type: "string", cel: "this.size() <= 16"},
					{ordinal: 3, name: "victim", type: "string", cel: "this.size() <= 16"},
					{ordinal: 4, name: "weapon", type: "string", cel: "this.size() <= 16"},
					{ordinal: 5, name: "tick", type: "int32", cel: "this >= 0"}
				]
			}
		}
	}

	capabilities: {
		blobs: false
		hatches: {}
		vendored: {
			upscaler: {
				isolation: "compartment"
				ports: {reads: [], raises: []}
				src: "shell/units/upscaler/xbrz.js"
				files: [
					"shell/units/upscaler/xbrz.js",
					"shell/units/upscaler/LICENSE",
					"shell/units/upscaler/NOTICE.md",
				]
				note: "xbrz-js@1.9.2, pure JavaScript module pinned by sha256 in NOTICE.md"
			}
		}
	}

	surface: {
		screens: {
			arena: {
				title: "Arena"
				route: "/"
				markup: _arenaMarkup
				forms: []
				states: ["warmup", "active", "over"]
				files: {
					shared: []
					renderers: []
				}
			}
			lobby: {
				title: "Lobby"
				route: "/lobby"
				markup: _lobbyMarkup
				forms: []
				states: ["ready"]
				files: {
					shared: []
					renderers: []
				}
			}
		}

		handlers: {
			referee: {
				of: "arena"
				src: "shell/handlers/referee.js"
				note: "tracks frag milestones, player/opponent score counters, and match termination"
			}
			match_control: {
				of: "arena"
				src: "shell/handlers/match_control.js"
				note: "Iniciar starts a match in warmup and Outra Partida resets one; the engine follows the match row"
			}
			enter_arena: {
				of: "lobby"
				src: "shell/handlers/enter_arena.js"
				note: "resets match score, player stats, and clears previous frags before arena entry"
			}
		}

		design: (pronto.#DesignMd & {text: _designMd}).design

		flows: {
			"start-match": {of: "arena", entity: "Match", action: "update"}
			"record-frag": {of: "arena", entity: "Frag", action: "create"}
			"update-player": {of: "arena", entity: "Player", action: "update"}
		}
	}

	meta: {
		name: "doom"
		description: "Doom multiplayer deathmatch arena in Pronto"
		ir: {sha256: "55f0cf36fcc662cf769f51100fe092bdd20f65bab82ed67f8fa1979fd33eb72e"}
		targets: ["cloudflare"]
		decisions: {
			"decision-01": {}
			"decision-02": {}
			"decision-03": {}
			"decision-04": {}
			"decision-escape-hatches": {}
		}
		tests: {
			"test-instant-arena": {
				of: "arena"
				says: "Opening the arena lands immediately in the 3D deathmatch with a ready status bar and initial marine stats."
				given: {}
				when: "mount screen"
				then: "output.ready"
			}
			"test-status-hud": {
				of: "arena"
				says: "Ammo, Health, Armor, and Arms display the initial player stats correctly."
				given: {health: 100, armor: 50, ammo: 50}
				when: "render status bar"
				then: "output.health == 100 && output.armor == 50 && output.ammo == 50"
			}
			"test-doomguy-face": {
				of: "arena"
				says: "Doomguy face shows healthy grin initially, switches to grimace when health drops, and dead state at 0."
				given: {health: 0}
				when: "player dies"
				then: "output.face == 'dead'"
			}
			"test-frag-feed": {
				of: "arena"
				says: "Registering a kill creates a frag feed entry with killer, weapon icon, and victim."
				given: {killer: "Slayer", victim: "Imp", weapon: "shotgun"}
				when: "frag recorded"
				then: "output.feedEntries == 1"
			}
			"test-weapon-switch": {
				of: "arena"
				says: "Selecting another weapon slot switches active weapon and updates ammo counters."
				given: {weapon: "shotgun"}
				when: "select weapon 3"
				then: "output.weapon == 'shotgun'"
			}
			"test-match-over": {
				of: "arena"
				says: "Reaching the frag limit transitions match phase to over and reveals the rematch button."
				given: {frags_us: 20, limit: 20}
				when: "check limit"
				then: "output.status == 'over'"
			}
			"test-offline": {
				of: "arena"
				says: "The game boots and operates cleanly offline without network connectivity."
				given: {network: "offline"}
				when: "boot arena"
				then: "output.playable"
			}
		}
	}
}

_extraDoomStatics: [
	for f in [
		"shell/vendor/babylon/babylon.js",
		"shell/vendor/babylon/license.md",
		"shell/vendor/babylon/NOTICE.md",
		"shell/vendor/babylon/SOURCE.md",
		"shell/engine/actors.js",
		"shell/engine/assets.js",
		"shell/engine/audio.js",
		"shell/engine/bridge.js",
		"shell/engine/catalog.js",
		"shell/engine/collide.js",
		"shell/engine/combat.js",
		"shell/engine/constants.js",
		"shell/engine/level.js",
		"shell/engine/monsters.js",
		"shell/engine/monsters_table.js",
		"shell/engine/movers.js",
		"shell/engine/noise.js",
		"shell/engine/player.js",
		"shell/engine/projectiles.js",
		"shell/engine/referee.js",
		"shell/engine/renderer.js",
		"shell/engine/sectors.js",
		"shell/engine/simulation.js",
		"shell/engine/sprites.js",
		"shell/engine/trace.js",
		"shell/engine/weapons.js",
		"shell/handlers/referee.js",
		"showcase.html",
	] {
		file:   f
		target: "/srv/\(f)"
		watch:  true
	},
	for f in [
		"shell/assets/flats/aqf001.png",
		"shell/assets/flats/aqf002.png",
		"shell/assets/flats/aqf003.png",
		"shell/assets/flats/aqf004.png",
		"shell/assets/flats/aqf007.png",
		"shell/assets/flats/aqf009.png",
		"shell/assets/flats/aqf010.png",
		"shell/assets/flats/aqf012.png",
		"shell/assets/flats/aqf013.png",
		"shell/assets/flats/aqf014.png",
		"shell/assets/flats/aqf016.png",
		"shell/assets/flats/aqf017.png",
		"shell/assets/flats/aqf018.png",
		"shell/assets/flats/aqf021.png",
		"shell/assets/flats/aqf022.png",
		"shell/assets/flats/aqf024.png",
		"shell/assets/flats/aqf025.png",
		"shell/assets/flats/aqf028.png",
		"shell/assets/flats/aqf029.png",
		"shell/assets/flats/aqf030.png",
		"shell/assets/flats/aqf031.png",
		"shell/assets/flats/aqf032.png",
		"shell/assets/flats/aqf033.png",
		"shell/assets/flats/aqf034.png",
		"shell/assets/flats/aqf044.png",
		"shell/assets/flats/aqf046.png",
		"shell/assets/flats/aqf050.png",
		"shell/assets/flats/aqf051.png",
		"shell/assets/flats/aqf052.png",
		"shell/assets/flats/aqf054.png",
		"shell/assets/flats/aqf055.png",
		"shell/assets/flats/aqf057.png",
		"shell/assets/flats/aqf058.png",
		"shell/assets/flats/aqf059.png",
		"shell/assets/flats/aqf060.png",
		"shell/assets/flats/aqf065.png",
		"shell/assets/flats/aqf067.png",
		"shell/assets/flats/aqf068.png",
		"shell/assets/flats/aqf069.png",
		"shell/assets/flats/aqf070.png",
		"shell/assets/flats/aqf071.png",
		"shell/assets/flats/aqf072.png",
		"shell/assets/flats/aqf073.png",
		"shell/assets/flats/aqf075.png",
		"shell/assets/flats/blood1.png",
		"shell/assets/flats/blood2.png",
		"shell/assets/flats/blood3.png",
		"shell/assets/flats/ceil1_2.png",
		"shell/assets/flats/ceil1_3.png",
		"shell/assets/flats/ceil3_2.png",
		"shell/assets/flats/ceil3_3.png",
		"shell/assets/flats/ceil3_4.png",
		"shell/assets/flats/ceil3_5.png",
		"shell/assets/flats/ceil3_6.png",
		"shell/assets/flats/ceil4_1.png",
		"shell/assets/flats/ceil4_2.png",
		"shell/assets/flats/ceil4_3.png",
		"shell/assets/flats/ceil5_1.png",
		"shell/assets/flats/ceil5_2.png",
		"shell/assets/flats/ceil5_3.png",
		"shell/assets/flats/cons1_1.png",
		"shell/assets/flats/cons1_5.png",
		"shell/assets/flats/cons1_7.png",
		"shell/assets/flats/cons1_9.png",
		"shell/assets/flats/cratop1.png",
		"shell/assets/flats/cratop2.png",
		"shell/assets/flats/dem1_1.png",
		"shell/assets/flats/dem1_2.png",
		"shell/assets/flats/dem1_3.png",
		"shell/assets/flats/dem1_4.png",
		"shell/assets/flats/dem1_6.png",
		"shell/assets/flats/fcgrate2.png",
		"shell/assets/flats/flat1.png",
		"shell/assets/flats/flat10.png",
		"shell/assets/flats/flat14.png",
		"shell/assets/flats/flat17.png",
		"shell/assets/flats/flat18.png",
		"shell/assets/flats/flat19.png",
		"shell/assets/flats/flat1_3.png",
		"shell/assets/flats/flat2.png",
		"shell/assets/flats/flat20.png",
		"shell/assets/flats/flat22.png",
		"shell/assets/flats/flat23.png",
		"shell/assets/flats/flat3.png",
		"shell/assets/flats/flat4.png",
		"shell/assets/flats/flat5.png",
		"shell/assets/flats/flat5_1.png",
		"shell/assets/flats/flat5_3.png",
		"shell/assets/flats/flat5_4.png",
		"shell/assets/flats/flat5_5.png",
		"shell/assets/flats/flat5_7.png",
		"shell/assets/flats/flat8.png",
		"shell/assets/flats/flat9.png",
		"shell/assets/flats/floor0_1.png",
		"shell/assets/flats/floor0_2.png",
		"shell/assets/flats/floor0_3.png",
		"shell/assets/flats/floor0_5.png",
		"shell/assets/flats/floor0_6.png",
		"shell/assets/flats/floor0_7.png",
		"shell/assets/flats/floor1_1.png",
		"shell/assets/flats/floor1_6.png",
		"shell/assets/flats/floor3_3.png",
		"shell/assets/flats/floor4_1.png",
		"shell/assets/flats/floor4_6.png",
		"shell/assets/flats/floor4_8.png",
		"shell/assets/flats/floor5_1.png",
		"shell/assets/flats/floor5_2.png",
		"shell/assets/flats/floor5_3.png",
		"shell/assets/flats/floor5_4.png",
		"shell/assets/flats/floor6_1.png",
		"shell/assets/flats/floor6_2.png",
		"shell/assets/flats/floor7_1.png",
		"shell/assets/flats/floor7_2.png",
		"shell/assets/flats/fwater1.png",
		"shell/assets/flats/fwater2.png",
		"shell/assets/flats/fwater3.png",
		"shell/assets/flats/fwater4.png",
		"shell/assets/flats/grass1.png",
		"shell/assets/flats/grass2.png",
		"shell/assets/flats/lava1.png",
		"shell/assets/flats/lava2.png",
		"shell/assets/flats/lava3.png",
		"shell/assets/flats/lava4.png",
		"shell/assets/flats/mflr8_1.png",
		"shell/assets/flats/mflr8_2.png",
		"shell/assets/flats/mflr8_3.png",
		"shell/assets/flats/mflr8_4.png",
		"shell/assets/flats/nukage1.png",
		"shell/assets/flats/nukage2.png",
		"shell/assets/flats/nukage3.png",
		"shell/assets/flats/rrock03.png",
		"shell/assets/flats/rrock09.png",
		"shell/assets/flats/rrock10.png",
		"shell/assets/flats/rrock11.png",
		"shell/assets/flats/rrock12.png",
		"shell/assets/flats/rrock14.png",
		"shell/assets/flats/rrock16.png",
		"shell/assets/flats/rrock17.png",
		"shell/assets/flats/rrock18.png",
		"shell/assets/flats/rrock19.png",
		"shell/assets/flats/sflr6_1.png",
		"shell/assets/flats/sflr6_4.png",
		"shell/assets/flats/sflr7_1.png",
		"shell/assets/flats/sflr7_4.png",
		"shell/assets/flats/slime01.png",
		"shell/assets/flats/slime02.png",
		"shell/assets/flats/slime03.png",
		"shell/assets/flats/slime04.png",
		"shell/assets/flats/slime05.png",
		"shell/assets/flats/slime06.png",
		"shell/assets/flats/slime07.png",
		"shell/assets/flats/slime08.png",
		"shell/assets/flats/slime13.png",
		"shell/assets/flats/slime14.png",
		"shell/assets/flats/slime16.png",
		"shell/assets/flats/step1.png",
		"shell/assets/flats/step2.png",
		"shell/assets/flats/tlite6_1.png",
		"shell/assets/flats/tlite6_4.png",
		"shell/assets/flats/tlite6_5.png",
		"shell/assets/flats/tlite6_6.png",
		"shell/assets/levels/e1m1.json",
		"shell/assets/levels/e1m2.json",
		"shell/assets/levels/e1m3.json",
		"shell/assets/levels/e1m4.json",
		"shell/assets/levels/e1m5.json",
		"shell/assets/levels/e1m6.json",
		"shell/assets/levels/e1m7.json",
		"shell/assets/levels/e1m8.json",
		"shell/assets/levels/e1m9.json",
		"shell/assets/levels/index.json",
		"shell/assets/sounds/claw.wav",
		"shell/assets/sounds/demon_death.wav",
		"shell/assets/sounds/demon_pain.wav",
		"shell/assets/sounds/demon_sight.wav",
		"shell/assets/sounds/door_close.wav",
		"shell/assets/sounds/door_open.wav",
		"shell/assets/sounds/explode.wav",
		"shell/assets/sounds/fireball.wav",
		"shell/assets/sounds/pickup_item.wav",
		"shell/assets/sounds/pickup_weapon.wav",
		"shell/assets/sounds/pistol.wav",
		"shell/assets/sounds/player_death.wav",
		"shell/assets/sounds/player_pain.wav",
		"shell/assets/sounds/punch.wav",
		"shell/assets/sounds/shotgun.wav",
		"shell/assets/sounds/shotgun_cock.wav",
		"shell/assets/sounds/switch.wav",
		"shell/assets/sprites/face_dead.png",
		"shell/assets/sprites/face_evil.png",
		"shell/assets/sprites/face_kill.png",
		"shell/assets/sprites/face_left.png",
		"shell/assets/sprites/face_normal.png",
		"shell/assets/sprites/face_right.png",
		"shell/assets/textures/a-brbk28.png",
		"shell/assets/textures/a-brbrk.png",
		"shell/assets/textures/a-brick2.png",
		"shell/assets/textures/a-brick3.png",
		"shell/assets/textures/a-brown2.png",
		"shell/assets/textures/a-brown4.png",
		"shell/assets/textures/a-camo4.png",
		"shell/assets/textures/a-concte.png",
		"shell/assets/textures/a-dbri28.png",
		"shell/assets/textures/a-drock1.png",
		"shell/assets/textures/a-grate.png",
		"shell/assets/textures/a-marble.png",
		"shell/assets/textures/a-mosbk8.png",
		"shell/assets/textures/a-mosrok.png",
		"shell/assets/textures/a-mud.png",
		"shell/assets/textures/a-vine1.png",
		"shell/assets/textures/a-vine3.png",
		"shell/assets/textures/aqcomp01.png",
		"shell/assets/textures/aqconc04.png",
		"shell/assets/textures/aqconc05.png",
		"shell/assets/textures/aqconc06.png",
		"shell/assets/textures/aqconc07.png",
		"shell/assets/textures/aqconc08.png",
		"shell/assets/textures/aqconc10.png",
		"shell/assets/textures/aqconc11.png",
		"shell/assets/textures/aqconc13.png",
		"shell/assets/textures/aqconc14.png",
		"shell/assets/textures/aqconc15.png",
		"shell/assets/textures/aqconc16.png",
		"shell/assets/textures/aqconc18.png",
		"shell/assets/textures/aqdirt03.png",
		"shell/assets/textures/aqdoor01.png",
		"shell/assets/textures/aqdoor02.png",
		"shell/assets/textures/aqlite01.png",
		"shell/assets/textures/aqlite07.png",
		"shell/assets/textures/aqlite08.png",
		"shell/assets/textures/aqlite15.png",
		"shell/assets/textures/aqlite17.png",
		"shell/assets/textures/aqlite18.png",
		"shell/assets/textures/aqmetl01.png",
		"shell/assets/textures/aqmetl02.png",
		"shell/assets/textures/aqmetl03.png",
		"shell/assets/textures/aqmetl06.png",
		"shell/assets/textures/aqmetl07.png",
		"shell/assets/textures/aqmetl09.png",
		"shell/assets/textures/aqmetl10.png",
		"shell/assets/textures/aqmetl11.png",
		"shell/assets/textures/aqmetl12.png",
		"shell/assets/textures/aqmetl13.png",
		"shell/assets/textures/aqmetl14.png",
		"shell/assets/textures/aqmetl15.png",
		"shell/assets/textures/aqmetl17.png",
		"shell/assets/textures/aqmetl20.png",
		"shell/assets/textures/aqmetl21.png",
		"shell/assets/textures/aqmetl24.png",
		"shell/assets/textures/aqmetl25.png",
		"shell/assets/textures/aqmetl26.png",
		"shell/assets/textures/aqmetl27.png",
		"shell/assets/textures/aqmetl28.png",
		"shell/assets/textures/aqmetl29.png",
		"shell/assets/textures/aqmetl30.png",
		"shell/assets/textures/aqmetl31.png",
		"shell/assets/textures/aqmetl32.png",
		"shell/assets/textures/aqmetl33.png",
		"shell/assets/textures/aqpanl01.png",
		"shell/assets/textures/aqpanl02.png",
		"shell/assets/textures/aqpanl04.png",
		"shell/assets/textures/aqpanl05.png",
		"shell/assets/textures/aqpanl06.png",
		"shell/assets/textures/aqpanl08.png",
		"shell/assets/textures/aqpanl09.png",
		"shell/assets/textures/aqpipe01.png",
		"shell/assets/textures/aqpipe02.png",
		"shell/assets/textures/aqpipe05.png",
		"shell/assets/textures/aqpipe06.png",
		"shell/assets/textures/aqpipe08.png",
		"shell/assets/textures/aqpipe09.png",
		"shell/assets/textures/aqpipe14.png",
		"shell/assets/textures/aqrust02.png",
		"shell/assets/textures/aqrust05.png",
		"shell/assets/textures/aqrust09.png",
		"shell/assets/textures/aqrust10.png",
		"shell/assets/textures/aqsect07.png",
		"shell/assets/textures/aqsect11.png",
		"shell/assets/textures/aqsupp01.png",
		"shell/assets/textures/aqsupp04.png",
		"shell/assets/textures/aqsupp05.png",
		"shell/assets/textures/aqsupp06.png",
		"shell/assets/textures/aqsupp08.png",
		"shell/assets/textures/aqsupp09.png",
		"shell/assets/textures/aqsupp10.png",
		"shell/assets/textures/aqsupp11.png",
		"shell/assets/textures/aqsupp12.png",
		"shell/assets/textures/aqsupp13.png",
		"shell/assets/textures/aqtile01.png",
		"shell/assets/textures/aqtile02.png",
		"shell/assets/textures/aqtrim02.png",
		"shell/assets/textures/aqtrim05.png",
		"shell/assets/textures/aqtrim07.png",
		"shell/assets/textures/ashwall.png",
		"shell/assets/textures/ashwall2.png",
		"shell/assets/textures/ashwall4.png",
		"shell/assets/textures/ashwall7.png",
		"shell/assets/textures/base.png",
		"shell/assets/textures/base2.png",
		"shell/assets/textures/bfall1.png",
		"shell/assets/textures/bfall2.png",
		"shell/assets/textures/bfall3.png",
		"shell/assets/textures/bfall4.png",
		"shell/assets/textures/bigbrik2.png",
		"shell/assets/textures/bigdoor1.png",
		"shell/assets/textures/bigdoor2.png",
		"shell/assets/textures/bigdoor3.png",
		"shell/assets/textures/bigdoor4.png",
		"shell/assets/textures/bigdoor6.png",
		"shell/assets/textures/brick10.png",
		"shell/assets/textures/brick8.png",
		"shell/assets/textures/brnbigc.png",
		"shell/assets/textures/brnpois.png",
		"shell/assets/textures/brnsmal1.png",
		"shell/assets/textures/brnsmal2.png",
		"shell/assets/textures/brnsmalc.png",
		"shell/assets/textures/brnsmall.png",
		"shell/assets/textures/brnsmalr.png",
		"shell/assets/textures/bronze1.png",
		"shell/assets/textures/bronze3.png",
		"shell/assets/textures/brovine.png",
		"shell/assets/textures/brown1.png",
		"shell/assets/textures/brown144.png",
		"shell/assets/textures/brown96.png",
		"shell/assets/textures/browngrn.png",
		"shell/assets/textures/brownhug.png",
		"shell/assets/textures/brownpip.png",
		"shell/assets/textures/bstone2.png",
		"shell/assets/textures/carllf2.png",
		"shell/assets/textures/carlrt2.png",
		"shell/assets/textures/cavern4.png",
		"shell/assets/textures/ceilvine.png",
		"shell/assets/textures/cement1.png",
		"shell/assets/textures/cement2.png",
		"shell/assets/textures/cement3.png",
		"shell/assets/textures/cement4.png",
		"shell/assets/textures/cement5.png",
		"shell/assets/textures/cement6.png",
		"shell/assets/textures/cement7.png",
		"shell/assets/textures/cement8.png",
		"shell/assets/textures/cempois.png",
		"shell/assets/textures/comp2.png",
		"shell/assets/textures/compblue.png",
		"shell/assets/textures/complit3.png",
		"shell/assets/textures/compohso.png",
		"shell/assets/textures/compspan.png",
		"shell/assets/textures/compsta1.png",
		"shell/assets/textures/compsta2.png",
		"shell/assets/textures/comptall.png",
		"shell/assets/textures/comptile.png",
		"shell/assets/textures/compute1.png",
		"shell/assets/textures/compute2.png",
		"shell/assets/textures/compute3.png",
		"shell/assets/textures/compute4.png",
		"shell/assets/textures/compvent.png",
		"shell/assets/textures/compwera.png",
		"shell/assets/textures/compwerb.png",
		"shell/assets/textures/compwerd.png",
		"shell/assets/textures/compwere.png",
		"shell/assets/textures/compwerf.png",
		"shell/assets/textures/cr128lb.png",
		"shell/assets/textures/cr64hbbp.png",
		"shell/assets/textures/cr64hbrm.png",
		"shell/assets/textures/crate1.png",
		"shell/assets/textures/crate2.png",
		"shell/assets/textures/crate3.png",
		"shell/assets/textures/cratelit.png",
		"shell/assets/textures/cratiny.png",
		"shell/assets/textures/cratwide.png",
		"shell/assets/textures/crawhbp.png",
		"shell/assets/textures/dobwire.png",
		"shell/assets/textures/door1.png",
		"shell/assets/textures/door3.png",
		"shell/assets/textures/doorblu.png",
		"shell/assets/textures/doorhi.png",
		"shell/assets/textures/doorred.png",
		"shell/assets/textures/doorstop.png",
		"shell/assets/textures/doortrak.png",
		"shell/assets/textures/dooryel.png",
		"shell/assets/textures/egsuprt3.png",
		"shell/assets/textures/exitdoor.png",
		"shell/assets/textures/exitsgn2.png",
		"shell/assets/textures/exitsign.png",
		"shell/assets/textures/fireblu1.png",
		"shell/assets/textures/fireblu2.png",
		"shell/assets/textures/gray1.png",
		"shell/assets/textures/gray2.png",
		"shell/assets/textures/gray4.png",
		"shell/assets/textures/gray5.png",
		"shell/assets/textures/gray7.png",
		"shell/assets/textures/gray8.png",
		"shell/assets/textures/graybig.png",
		"shell/assets/textures/graypois.png",
		"shell/assets/textures/graytall.png",
		"shell/assets/textures/graywide.png",
		"shell/assets/textures/gstone1.png",
		"shell/assets/textures/gstone2.png",
		"shell/assets/textures/gstvine2.png",
		"shell/assets/textures/ickwall1.png",
		"shell/assets/textures/ickwall2.png",
		"shell/assets/textures/ickwall3.png",
		"shell/assets/textures/ickwall4.png",
		"shell/assets/textures/lite3.png",
		"shell/assets/textures/lite4.png",
		"shell/assets/textures/lite5.png",
		"shell/assets/textures/liteblu1.png",
		"shell/assets/textures/liteblu2.png",
		"shell/assets/textures/liteblu3.png",
		"shell/assets/textures/liteblu4.png",
		"shell/assets/textures/liteblu5.png",
		"shell/assets/textures/litemet.png",
		"shell/assets/textures/litered.png",
		"shell/assets/textures/liteyel2.png",
		"shell/assets/textures/liteyel3.png",
		"shell/assets/textures/marbfac2.png",
		"shell/assets/textures/marbfac3.png",
		"shell/assets/textures/marbgray.png",
		"shell/assets/textures/marble1.png",
		"shell/assets/textures/marble2.png",
		"shell/assets/textures/mc17.png",
		"shell/assets/textures/mc18.png",
		"shell/assets/textures/mc19.png",
		"shell/assets/textures/mc2.png",
		"shell/assets/textures/mc3.png",
		"shell/assets/textures/mc5.png",
		"shell/assets/textures/metal.png",
		"shell/assets/textures/metal1.png",
		"shell/assets/textures/metal2.png",
		"shell/assets/textures/metal4.png",
		"shell/assets/textures/metal5.png",
		"shell/assets/textures/metal6.png",
		"shell/assets/textures/midbars1.png",
		"shell/assets/textures/midbars3.png",
		"shell/assets/textures/midbrn1.png",
		"shell/assets/textures/midgrate.png",
		"shell/assets/textures/midspace.png",
		"shell/assets/textures/midspcsm.png",
		"shell/assets/textures/mtnt1.png",
		"shell/assets/textures/nuke24.png",
		"shell/assets/textures/nukedge1.png",
		"shell/assets/textures/nukeslad.png",
		"shell/assets/textures/pipe2.png",
		"shell/assets/textures/pipes.png",
		"shell/assets/textures/planet1.png",
		"shell/assets/textures/plat1.png",
		"shell/assets/textures/pwhite.png",
		"shell/assets/textures/redwall1.png",
		"shell/assets/textures/rock5.png",
		"shell/assets/textures/rockred1.png",
		"shell/assets/textures/rockred2.png",
		"shell/assets/textures/rockred3.png",
		"shell/assets/textures/sfall1.png",
		"shell/assets/textures/sfall2.png",
		"shell/assets/textures/sfall3.png",
		"shell/assets/textures/sfall4.png",
		"shell/assets/textures/shawn02.png",
		"shell/assets/textures/shawn1.png",
		"shell/assets/textures/shawn2.png",
		"shell/assets/textures/shawn3.png",
		"shell/assets/textures/silver1.png",
		"shell/assets/textures/sk_left.png",
		"shell/assets/textures/sk_right.png",
		"shell/assets/textures/skin2.png",
		"shell/assets/textures/skinedge.png",
		"shell/assets/textures/skintek1.png",
		"shell/assets/textures/sksnake1.png",
		"shell/assets/textures/sksnake2.png",
		"shell/assets/textures/skspine2.png",
		"shell/assets/textures/sky1.png",
		"shell/assets/textures/sladpois.png",
		"shell/assets/textures/sladrip1.png",
		"shell/assets/textures/sladrip2.png",
		"shell/assets/textures/sladrip3.png",
		"shell/assets/textures/sladskul.png",
		"shell/assets/textures/sladwall.png",
		"shell/assets/textures/slime2.png",
		"shell/assets/textures/sloppy1.png",
		"shell/assets/textures/sloppy2.png",
		"shell/assets/textures/smglass1.png",
		"shell/assets/textures/sp_face2.png",
		"shell/assets/textures/sp_hot1.png",
		"shell/assets/textures/sp_rock1.png",
		"shell/assets/textures/spacew3.png",
		"shell/assets/textures/spcdoor3.png",
		"shell/assets/textures/starbr1.png",
		"shell/assets/textures/starbr2.png",
		"shell/assets/textures/starg1.png",
		"shell/assets/textures/starg2.png",
		"shell/assets/textures/starg3.png",
		"shell/assets/textures/starg4.png",
		"shell/assets/textures/stargr1.png",
		"shell/assets/textures/stargr2.png",
		"shell/assets/textures/startan1.png",
		"shell/assets/textures/startan2.png",
		"shell/assets/textures/startan3.png",
		"shell/assets/textures/step1.png",
		"shell/assets/textures/step2.png",
		"shell/assets/textures/step3.png",
		"shell/assets/textures/step4.png",
		"shell/assets/textures/step5.png",
		"shell/assets/textures/step6.png",
		"shell/assets/textures/steplad1.png",
		"shell/assets/textures/steptop.png",
		"shell/assets/textures/stone.png",
		"shell/assets/textures/stone2.png",
		"shell/assets/textures/stone3.png",
		"shell/assets/textures/stone4.png",
		"shell/assets/textures/stucco.png",
		"shell/assets/textures/support2.png",
		"shell/assets/textures/support3.png",
		"shell/assets/textures/sw1blue.png",
		"shell/assets/textures/sw1brcom.png",
		"shell/assets/textures/sw1brn1.png",
		"shell/assets/textures/sw1brn2.png",
		"shell/assets/textures/sw1brngn.png",
		"shell/assets/textures/sw1cmt.png",
		"shell/assets/textures/sw1comm.png",
		"shell/assets/textures/sw1comp.png",
		"shell/assets/textures/sw1exit.png",
		"shell/assets/textures/sw1gray.png",
		"shell/assets/textures/sw1gray1.png",
		"shell/assets/textures/sw1met2.png",
		"shell/assets/textures/sw1metal.png",
		"shell/assets/textures/sw1pipe.png",
		"shell/assets/textures/sw1slad.png",
		"shell/assets/textures/sw1ston1.png",
		"shell/assets/textures/sw1ston2.png",
		"shell/assets/textures/sw1strtn.png",
		"shell/assets/textures/sw2blue.png",
		"shell/assets/textures/sw2brcom.png",
		"shell/assets/textures/sw2brn1.png",
		"shell/assets/textures/sw2brn2.png",
		"shell/assets/textures/sw2brngn.png",
		"shell/assets/textures/sw2cmt.png",
		"shell/assets/textures/sw2comm.png",
		"shell/assets/textures/sw2comp.png",
		"shell/assets/textures/sw2exit.png",
		"shell/assets/textures/sw2gray.png",
		"shell/assets/textures/sw2gray1.png",
		"shell/assets/textures/sw2met2.png",
		"shell/assets/textures/sw2metal.png",
		"shell/assets/textures/sw2pipe.png",
		"shell/assets/textures/sw2slad.png",
		"shell/assets/textures/sw2ston1.png",
		"shell/assets/textures/sw2ston2.png",
		"shell/assets/textures/sw2strtn.png",
		"shell/assets/textures/tanrock5.png",
		"shell/assets/textures/tekgren1.png",
		"shell/assets/textures/tekgren2.png",
		"shell/assets/textures/tekgren4.png",
		"shell/assets/textures/teklite.png",
		"shell/assets/textures/teklite2.png",
		"shell/assets/textures/tekwall1.png",
		"shell/assets/textures/tekwall2.png",
		"shell/assets/textures/tekwall3.png",
		"shell/assets/textures/tekwall4.png",
		"shell/assets/textures/tekwall5.png",
		"shell/assets/textures/wfall1.png",
		"shell/assets/textures/wfall2.png",
		"shell/assets/textures/wfall3.png",
		"shell/assets/textures/wfall4.png",
		"shell/assets/textures/wood1.png",
		"shell/assets/textures/woodmet1.png",
		"shell/assets/textures/zimmer3.png",
		"shell/assets/things/ammoa.png",
		"shell/assets/things/arm1a.png",
		"shell/assets/things/arm1b.png",
		"shell/assets/things/arm2a.png",
		"shell/assets/things/arm2b.png",
		"shell/assets/things/bal1a.png",
		"shell/assets/things/bal1b.png",
		"shell/assets/things/bal1c.png",
		"shell/assets/things/bal1d.png",
		"shell/assets/things/bal1e.png",
		"shell/assets/things/bal7a.png",
		"shell/assets/things/bal7b.png",
		"shell/assets/things/bal7c.png",
		"shell/assets/things/bal7d.png",
		"shell/assets/things/bal7e.png",
		"shell/assets/things/bar1a.png",
		"shell/assets/things/bar1b.png",
		"shell/assets/things/bexpa.png",
		"shell/assets/things/bexpb.png",
		"shell/assets/things/bexpc.png",
		"shell/assets/things/bexpd.png",
		"shell/assets/things/bexpe.png",
		"shell/assets/things/bfe1a.png",
		"shell/assets/things/bfe1b.png",
		"shell/assets/things/bfe1c.png",
		"shell/assets/things/bfe1d.png",
		"shell/assets/things/bfe1e.png",
		"shell/assets/things/bfe1f.png",
		"shell/assets/things/bfgfa.png",
		"shell/assets/things/bfgfb.png",
		"shell/assets/things/bfgga.png",
		"shell/assets/things/bfggb.png",
		"shell/assets/things/bfggc.png",
		"shell/assets/things/bfs1a.png",
		"shell/assets/things/bfs1b.png",
		"shell/assets/things/bfuga.png",
		"shell/assets/things/bkeya.png",
		"shell/assets/things/bkeyb.png",
		"shell/assets/things/bon1a.png",
		"shell/assets/things/bon1b.png",
		"shell/assets/things/bon1c.png",
		"shell/assets/things/bon1d.png",
		"shell/assets/things/bon2a.png",
		"shell/assets/things/bon2b.png",
		"shell/assets/things/bon2c.png",
		"shell/assets/things/bon2d.png",
		"shell/assets/things/bossa.png",
		"shell/assets/things/bossb.png",
		"shell/assets/things/bossc.png",
		"shell/assets/things/bossd.png",
		"shell/assets/things/bosse.png",
		"shell/assets/things/bossf.png",
		"shell/assets/things/bossg.png",
		"shell/assets/things/bossh.png",
		"shell/assets/things/bossi.png",
		"shell/assets/things/bossj.png",
		"shell/assets/things/bossk.png",
		"shell/assets/things/bossl.png",
		"shell/assets/things/bossm.png",
		"shell/assets/things/bossn.png",
		"shell/assets/things/bosso.png",
		"shell/assets/things/bpaka.png",
		"shell/assets/things/broka.png",
		"shell/assets/things/canda.png",
		"shell/assets/things/cbraa.png",
		"shell/assets/things/cella.png",
		"shell/assets/things/celpa.png",
		"shell/assets/things/chgfa.png",
		"shell/assets/things/chgfb.png",
		"shell/assets/things/chgga.png",
		"shell/assets/things/chggb.png",
		"shell/assets/things/clipa.png",
		"shell/assets/things/col1a.png",
		"shell/assets/things/col2a.png",
		"shell/assets/things/col3a.png",
		"shell/assets/things/col5a.png",
		"shell/assets/things/col5b.png",
		"shell/assets/things/colua.png",
		"shell/assets/things/csawa.png",
		"shell/assets/things/eleca.png",
		"shell/assets/things/fskua.png",
		"shell/assets/things/fskub.png",
		"shell/assets/things/fskuc.png",
		"shell/assets/things/gor1a.png",
		"shell/assets/things/gor1b.png",
		"shell/assets/things/gor1c.png",
		"shell/assets/things/gor2a.png",
		"shell/assets/things/gor4a.png",
		"shell/assets/things/gor5a.png",
		"shell/assets/things/heada.png",
		"shell/assets/things/headb.png",
		"shell/assets/things/headc.png",
		"shell/assets/things/headd.png",
		"shell/assets/things/heade.png",
		"shell/assets/things/headf.png",
		"shell/assets/things/headg.png",
		"shell/assets/things/headh.png",
		"shell/assets/things/headi.png",
		"shell/assets/things/headj.png",
		"shell/assets/things/headk.png",
		"shell/assets/things/headl.png",
		"shell/assets/things/index.json",
		"shell/assets/things/launa.png",
		"shell/assets/things/media.png",
		"shell/assets/things/mguna.png",
		"shell/assets/things/misfa.png",
		"shell/assets/things/misfb.png",
		"shell/assets/things/misfc.png",
		"shell/assets/things/misfd.png",
		"shell/assets/things/misga.png",
		"shell/assets/things/misgb.png",
		"shell/assets/things/misla.png",
		"shell/assets/things/mislb.png",
		"shell/assets/things/mislc.png",
		"shell/assets/things/misld.png",
		"shell/assets/things/pinsa.png",
		"shell/assets/things/pinsb.png",
		"shell/assets/things/pinsc.png",
		"shell/assets/things/pinsd.png",
		"shell/assets/things/pisfa.png",
		"shell/assets/things/pisga.png",
		"shell/assets/things/pisgb.png",
		"shell/assets/things/pisgc.png",
		"shell/assets/things/pisgd.png",
		"shell/assets/things/pisge.png",
		"shell/assets/things/plasa.png",
		"shell/assets/things/playa.png",
		"shell/assets/things/playb.png",
		"shell/assets/things/playc.png",
		"shell/assets/things/playd.png",
		"shell/assets/things/playe.png",
		"shell/assets/things/playf.png",
		"shell/assets/things/playg.png",
		"shell/assets/things/playh.png",
		"shell/assets/things/playi.png",
		"shell/assets/things/playj.png",
		"shell/assets/things/playk.png",
		"shell/assets/things/playl.png",
		"shell/assets/things/playm.png",
		"shell/assets/things/playn.png",
		"shell/assets/things/playo.png",
		"shell/assets/things/playp.png",
		"shell/assets/things/playq.png",
		"shell/assets/things/playr.png",
		"shell/assets/things/plays.png",
		"shell/assets/things/playt.png",
		"shell/assets/things/playu.png",
		"shell/assets/things/playv.png",
		"shell/assets/things/playw.png",
		"shell/assets/things/plsea.png",
		"shell/assets/things/plseb.png",
		"shell/assets/things/plsec.png",
		"shell/assets/things/plsed.png",
		"shell/assets/things/plsee.png",
		"shell/assets/things/plsfa.png",
		"shell/assets/things/plsfb.png",
		"shell/assets/things/plsga.png",
		"shell/assets/things/plsgb.png",
		"shell/assets/things/plssa.png",
		"shell/assets/things/plssb.png",
		"shell/assets/things/pmapa.png",
		"shell/assets/things/pmapb.png",
		"shell/assets/things/pmapc.png",
		"shell/assets/things/pmapd.png",
		"shell/assets/things/pol5a.png",
		"shell/assets/things/pol6a.png",
		"shell/assets/things/pol6b.png",
		"shell/assets/things/possa.png",
		"shell/assets/things/possb.png",
		"shell/assets/things/possc.png",
		"shell/assets/things/possd.png",
		"shell/assets/things/posse.png",
		"shell/assets/things/possf.png",
		"shell/assets/things/possg.png",
		"shell/assets/things/possh.png",
		"shell/assets/things/possi.png",
		"shell/assets/things/possj.png",
		"shell/assets/things/possk.png",
		"shell/assets/things/possl.png",
		"shell/assets/things/possm.png",
		"shell/assets/things/possn.png",
		"shell/assets/things/posso.png",
		"shell/assets/things/possp.png",
		"shell/assets/things/possq.png",
		"shell/assets/things/possr.png",
		"shell/assets/things/posss.png",
		"shell/assets/things/posst.png",
		"shell/assets/things/possu.png",
		"shell/assets/things/pstra.png",
		"shell/assets/things/puffa.png",
		"shell/assets/things/puffb.png",
		"shell/assets/things/puffc.png",
		"shell/assets/things/puffd.png",
		"shell/assets/things/punga.png",
		"shell/assets/things/pungb.png",
		"shell/assets/things/pungc.png",
		"shell/assets/things/pungd.png",
		"shell/assets/things/rkeya.png",
		"shell/assets/things/rkeyb.png",
		"shell/assets/things/rocka.png",
		"shell/assets/things/sarga.png",
		"shell/assets/things/sargb.png",
		"shell/assets/things/sargc.png",
		"shell/assets/things/sargd.png",
		"shell/assets/things/sarge.png",
		"shell/assets/things/sargf.png",
		"shell/assets/things/sargg.png",
		"shell/assets/things/sargh.png",
		"shell/assets/things/sargi.png",
		"shell/assets/things/sargj.png",
		"shell/assets/things/sargk.png",
		"shell/assets/things/sargl.png",
		"shell/assets/things/sargm.png",
		"shell/assets/things/sargn.png",
		"shell/assets/things/sawga.png",
		"shell/assets/things/sawgb.png",
		"shell/assets/things/sawgc.png",
		"shell/assets/things/sawgd.png",
		"shell/assets/things/sboxa.png",
		"shell/assets/things/shela.png",
		"shell/assets/things/shota.png",
		"shell/assets/things/shtfa.png",
		"shell/assets/things/shtfb.png",
		"shell/assets/things/shtga.png",
		"shell/assets/things/shtgb.png",
		"shell/assets/things/shtgc.png",
		"shell/assets/things/shtgd.png",
		"shell/assets/things/skula.png",
		"shell/assets/things/skulb.png",
		"shell/assets/things/skulc.png",
		"shell/assets/things/skuld.png",
		"shell/assets/things/skule.png",
		"shell/assets/things/skulf.png",
		"shell/assets/things/skulg.png",
		"shell/assets/things/skulh.png",
		"shell/assets/things/skuli.png",
		"shell/assets/things/skulj.png",
		"shell/assets/things/skulk.png",
		"shell/assets/things/smbta.png",
		"shell/assets/things/smbtb.png",
		"shell/assets/things/smbtc.png",
		"shell/assets/things/smbtd.png",
		"shell/assets/things/smgta.png",
		"shell/assets/things/smgtb.png",
		"shell/assets/things/smgtc.png",
		"shell/assets/things/smgtd.png",
		"shell/assets/things/smita.png",
		"shell/assets/things/smrta.png",
		"shell/assets/things/smrtb.png",
		"shell/assets/things/smrtc.png",
		"shell/assets/things/smrtd.png",
		"shell/assets/things/soula.png",
		"shell/assets/things/soulb.png",
		"shell/assets/things/soulc.png",
		"shell/assets/things/sould.png",
		"shell/assets/things/sposa.png",
		"shell/assets/things/sposb.png",
		"shell/assets/things/sposc.png",
		"shell/assets/things/sposd.png",
		"shell/assets/things/spose.png",
		"shell/assets/things/sposf.png",
		"shell/assets/things/sposg.png",
		"shell/assets/things/sposh.png",
		"shell/assets/things/sposi.png",
		"shell/assets/things/sposj.png",
		"shell/assets/things/sposk.png",
		"shell/assets/things/sposl.png",
		"shell/assets/things/sposm.png",
		"shell/assets/things/sposn.png",
		"shell/assets/things/sposo.png",
		"shell/assets/things/sposp.png",
		"shell/assets/things/sposq.png",
		"shell/assets/things/sposr.png",
		"shell/assets/things/sposs.png",
		"shell/assets/things/spost.png",
		"shell/assets/things/sposu.png",
		"shell/assets/things/stima.png",
		"shell/assets/things/suita.png",
		"shell/assets/things/tblua.png",
		"shell/assets/things/tblub.png",
		"shell/assets/things/tbluc.png",
		"shell/assets/things/tblud.png",
		"shell/assets/things/tgrna.png",
		"shell/assets/things/tgrnb.png",
		"shell/assets/things/tgrnc.png",
		"shell/assets/things/tgrnd.png",
		"shell/assets/things/tre1a.png",
		"shell/assets/things/tre2a.png",
		"shell/assets/things/treda.png",
		"shell/assets/things/tredb.png",
		"shell/assets/things/tredc.png",
		"shell/assets/things/tredd.png",
		"shell/assets/things/trooa.png",
		"shell/assets/things/troob.png",
		"shell/assets/things/trooc.png",
		"shell/assets/things/trood.png",
		"shell/assets/things/trooe.png",
		"shell/assets/things/troof.png",
		"shell/assets/things/troog.png",
		"shell/assets/things/trooh.png",
		"shell/assets/things/trooi.png",
		"shell/assets/things/trooj.png",
		"shell/assets/things/trook.png",
		"shell/assets/things/trool.png",
		"shell/assets/things/troom.png",
		"shell/assets/things/troon.png",
		"shell/assets/things/trooo.png",
		"shell/assets/things/troop.png",
		"shell/assets/things/trooq.png",
		"shell/assets/things/troor.png",
		"shell/assets/things/troos.png",
		"shell/assets/things/troot.png",
		"shell/assets/things/troou.png",
		"shell/assets/things/ykeya.png",
		"shell/assets/things/ykeyb.png",
	] {
		file:   f
		target: "/srv/\(f)"
		watch:  false
	},
]

_bootScript: _ @embed(file="shell/boot.js", type=text)


cluster: (pronto.#DefaultCluster & {
	"code":  code
	statics: list.Concat([terminal.surface.statics, _extraDoomStatics])
}).out
terminal: (pronto.#DefaultTerminal & {"code": code, boot: _bootScript}).out
loop: (pronto.#DefaultLoop & {"code": code, "cluster": cluster, "terminal": terminal}).out

loop: surface: checks: "simulation": {
	verb: "test"
	cmds: [
		"deno test --config tests/deno.json --lock tests/deno.lock --frozen --allow-read --allow-env tests/simulation.test.ts",
	]
	note: "deterministic 35Hz physics simulation step, bounding box collision, yaw direction math, and weapon firing"
}

loop: surface: checks: "engine": {
	verb: "test"
	cmds: [
		"deno test --config tests/deno.json --lock tests/deno.lock --frozen --allow-read tests/engine.test.ts",
	]
	note: "sector engine at real FreeDoom locations: steps, the E1M1 lift and blue-key ledge, locked doors, slime, secrets, exits, teleporters, hitscan, noise, determinism"
}

loop: surface: checks: "routes": {
	verb: "test"
	cmds: [
		"deno test --config tests/deno.json --lock tests/deno.lock --frozen --allow-read tests/routes.test.ts",
	]
	note: "every E1 exit (and E1M3's secret exit) is reachable from the start through keys, doors, lifts, floor triggers, teleporters and boss deaths"
}

loop: surface: checks: "levels": {
	verb: "test"
	cmds: [
		"deno test --config tests/deno.json --lock tests/deno.lock --frozen --allow-read tests/level_format.test.ts",
	]
	note: "compiled FreeDoom E1 levels: BSP and subsector polygons agree, heights match the WAD, every special, thing, texture and flat is supported and emitted"
}

loop: surface: checks: "arena": {
	verb: "test"
	cmds: [
		"deno test --config tests/deno.json --lock tests/deno.lock --frozen --allow-read tests/arena.test.ts",
	]
	note: "arena status HUD mounting, LinkeDOM reactive updates, Doomguy face transitions, and frag feed mutations"
}

loop: surface: checks: "kinetic": {
	verb: "test"
	cmds: [
		"deno test --config tests/deno.json --lock tests/deno.lock --frozen --allow-read tests/kinetic_engine.test.ts",
	]
	note: "algebraic isomorphism, referential transparency, 60-frame rollback invariance, and timeline branching"
}

loop: surface: checks: "referee": {
	verb: "test"
	cmds: [
		"deno test --config tests/deno.json --lock tests/deno.lock --frozen --allow-read --allow-env tests/referee.test.ts",
	]
	note: "match scoring, damage calculation, frag limits, and game-over transitions"
}

loop: surface: checks: "bridge": {
	verb: "test"
	cmds: [
		"deno test --config tests/deno.json --lock tests/deno.lock --frozen --allow-read --allow-env tests/bridge.test.ts",
	]
	note: "milestone promotion ordering, referee rejection, branch refusal below promoted milestones"
}

loop: surface: checks: "babylon": {
	verb: "test"
	cmds: ["deno test --config tests/deno.json --lock tests/deno.lock --frozen --allow-read --allow-env tests/babylon.test.ts"]
	note: "Babylon renders a scene after SES lockdown"
}

loop: surface: checks: "upscaler": {
	verb: "test"
	cmds: [
		"deno test --config tests/deno.json --lock tests/deno.lock --frozen --allow-read tests/upscaler.test.ts",
	]
	note: "xBRZ 2x/3x pixel scaling and vendored NOTICE.md SHA-256 checksums"
}

build: (pronto.#DefaultBuild & {"code": code, "loop": loop, "cluster": cluster, "terminal": terminal}).out

build: checks: "boot": {
	browser: true
	cmds: ["deno run --config tests/deno.json --lock tests/deno.lock --frozen --allow-read --allow-write --allow-net --allow-env --allow-run --allow-sys --unsafely-ignore-certificate-errors=caddy tests/boot.ts"]
	note: "the arena starts a match and renders its scene after terminal lockdown"
}



out: pronto.#emit & {"code": code, "cluster": cluster, "terminal": terminal, "loop": loop, "build": build}
