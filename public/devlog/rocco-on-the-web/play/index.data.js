(function () {
	var Module = window.Module;
	var dirs = [["/", "assets"], ["/assets", "images"], ["/assets", "meshes"], ["/assets", "sky"], ["/assets", "sound"], ["/assets", "source"], ["/assets/sky", "gloam"]];
	var files = [["/assets/images/fruit.png", 0, 1550], ["/assets/images/key.png", 1550, 2750], ["/assets/meshes/apple.glb", 2750, 115058], ["/assets/meshes/ball.glb", 115058, 137070], ["/assets/meshes/coin.glb", 137070, 161254], ["/assets/meshes/gloam_face.glb", 161254, 168562], ["/assets/meshes/key.glb", 168562, 179314], ["/assets/meshes/pumpkin.glb", 179314, 308122], ["/assets/meshes/watermelon.glb", 308122, 375426], ["/assets/sky/gloam/nx.png", 375426, 455769], ["/assets/sky/gloam/ny.png", 455769, 457266], ["/assets/sky/gloam/nz.png", 457266, 517554], ["/assets/sky/gloam/px.png", 517554, 593031], ["/assets/sky/gloam/py.png", 593031, 634026], ["/assets/sky/gloam/pz.png", 634026, 692109], ["/assets/sound/bounce.wav", 692109, 711353], ["/assets/sound/chime.wav", 711353, 744997], ["/assets/sound/jingle.wav", 744997, 802641], ["/assets/sound/key.wav", 802641, 841085], ["/assets/sound/last_key.wav", 841085, 956329], ["/assets/sound/tick.wav", 956329, 962133], ["/assets/source/make_icons.py", 962133, 967006], ["/assets/source/make_meshes.py", 967006, 987560], ["/assets/source/make_skies.py", 987560, 995654], ["/assets/source/make_sounds.py", 995654, 1001236]];
	var data = fetch("index.data").then(function (response) {
		if (!response.ok) {
			throw new Error(response.status + " " + response.url);
		}
		return response.arrayBuffer();
	});
	Module["preRun"] = Module["preRun"] || [];
	Module["preRun"].push(function () {
		Module["addRunDependency"]("index.data");
		data.then(function (buffer) {
			var bytes = new Uint8Array(buffer);
			dirs.forEach(function (dir) { Module["FS_createPath"](dir[0], dir[1], true, true); });
			files.forEach(function (file) { Module["FS_createDataFile"](file[0], null, bytes.subarray(file[1], file[2]), true, true, true); });
			Module["removeRunDependency"]("index.data");
		}, function (error) {
			console.error(error);
			window.dispatchEvent(new CustomEvent("rocco:stopped", { detail: { reason: "load", message: "The page could not load index.data." } }));
		});
	});
})();
