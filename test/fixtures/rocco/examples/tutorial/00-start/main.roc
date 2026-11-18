app [init, launch, loaded, step, view] { pf: platform "../../../platform/main.roc", roc: "nightly-2026-11-04-2622062" }

import pf.Vocabulary exposing [Command, Manifest]
import pf.Launch
import pf.Scene

Model : {}

launch : Vocabulary.Config -> Vocabulary.Launch
launch = |_config| Launch.default

init : Vocabulary.Config -> { model : Model, commands : List(Command) }
init = |_config| { model: {}, commands: [] }

loaded : Model, Str, Manifest -> Model
loaded = |model, _pack, _manifest| model

step : Model, Vocabulary.Input, Vocabulary.QueryResults, F32 -> { model : Model, commands : List(Command) }
step = |model, _input, _results, _dt| { model, commands: [] }

view : Model -> Vocabulary.Scene
view = |_model| Scene.empty
