import { assertEquals } from '@std/assert'
import '../shell/vendor/babylon/babylon.js'
import { ensureSes } from '/omnishell/interpreter/jessie.js'

Deno.test('Babylon creates and renders a scene after the terminal locks down intrinsics', async () => {
  await ensureSes()
  const BABYLON = (globalThis as any).BABYLON
  const engine = new BABYLON.NullEngine()
  const scene = new BABYLON.Scene(engine)
  new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene)
  new BABYLON.FreeCamera('camera', new BABYLON.Vector3(0, 0, 0), scene)
  scene.render()
  assertEquals(scene.activeCamera.name, 'camera')
  scene.dispose()
  engine.dispose()
})
