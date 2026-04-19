import * as THREE from "three";
import * as config from "../config.js";

export function buildCelestial(scene, celestialShell, materials, rng, renderStyle, counts) {
	const c = config.celestial;
	const col = config.colors;
	const clouds = [];
	const cnt = counts ?? config.counts;

	for (let i = 0; i < cnt.baseClouds; i++) {
		const cloud = new THREE.Group();
		const count = 4 + Math.floor(rng() * 4);
		for (let j = 0; j < count; j++) {
			const puff = new THREE.Mesh(new THREE.SphereGeometry(0.4 + rng() * 0.5, 7, 6), materials.cloudMat);
			puff.position.set((rng() - 0.5) * 1.5, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.8);
			puff.scale.y = 0.5 + rng() * 0.3;
			cloud.add(puff);
		}
		cloud.position.set((rng() - 0.5) * c.cloudSpread, c.cloudBaseY + rng() * c.cloudYJitter, (rng() - 0.5) * c.cloudSpread);
		cloud.userData.speed = 0.15 + rng() * 0.25;
		cloud.userData.startX = cloud.position.x;
		cloud.userData.startZ = cloud.position.z;
		clouds.push(cloud);
		scene.add(cloud);
	}

	const moonShaderUniforms = {
		sunWorldPos: { value: new THREE.Vector3(1, 0, 0) },
		cameraWorldPos: { value: new THREE.Vector3() },
		uTime: { value: 0 },
		moonBrightness: { value: 1 },
	};
	const moonMat = new THREE.ShaderMaterial({
		uniforms: moonShaderUniforms,
		vertexShader: `
		varying vec3 vWorldNormal;
		varying vec3 vWorldPos;
		void main() {
			vWorldNormal = normalize(mat3(modelMatrix) * normal);
			vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
		fragmentShader: `
		uniform vec3 sunWorldPos;
		uniform vec3 cameraWorldPos;
		uniform float uTime;
		uniform float moonBrightness;
		varying vec3 vWorldNormal;
		varying vec3 vWorldPos;

		vec3 hash33(vec3 p3) {
			p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
			p3 += dot(p3, p3.yxz + 33.33);
			return fract((p3.xxy + p3.yxx) * p3.zyx);
		}

		// Shortest distance to a random point in each cell — seamless on a sphere when sampled on N.
		float worley(vec3 x) {
			vec3 ix = floor(x);
			vec3 fx = fract(x);
			float md = 1.0;
			for (int a = -1; a <= 1; a++) {
				for (int b = -1; b <= 1; b++) {
					for (int c = -1; c <= 1; c++) {
						vec3 o = vec3(float(a), float(b), float(c));
						vec3 r = o + hash33(ix + o) - fx;
						md = min(md, dot(r, r));
					}
				}
			}
			return sqrt(md);
		}

		void main() {
			vec3 N = normalize(vWorldNormal);
			vec3 L = normalize(sunWorldPos - vWorldPos);
			vec3 V = normalize(cameraWorldPos - vWorldPos);
			float ndotl = dot(N, L);
			float lit = smoothstep(-0.4, 0.34, ndotl);
			lit = lit * lit * (3.0 - 2.0 * lit);
			float facing = max(0.0, dot(N, V));

			vec3 P = N;
			float wMare = worley(P * 1.25 + vec3(3.7, 0.0, 1.9));
			float mare = smoothstep(0.22, 0.72, wMare);
			float wCrater = worley(P * 3.85);
			float bowl = smoothstep(0.4, 0.028, wCrater);
			float wFine = worley(P * 11.2 + vec3(41.0, 17.3, 8.1));
			bowl += smoothstep(0.3, 0.022, wFine) * 0.52;
			bowl = clamp(bowl, 0.0, 1.0);
			float craterShade = bowl * (0.27 + 0.14 * lit);
			float albedo = (1.0 - craterShade) * mix(0.91, 1.0, mare);

			vec3 nightSide = vec3(0.17, 0.19, 0.26) * moonBrightness;
			vec3 twilight = vec3(0.38, 0.4, 0.48) * moonBrightness;
			vec3 daySide = vec3(0.82, 0.86, 0.96) * moonBrightness;
			vec3 col = mix(mix(nightSide, twilight, smoothstep(0.0, 0.65, lit)), daySide, smoothstep(0.35, 1.0, lit));
			col *= albedo;
			col *= mix(vec3(0.93, 0.91, 0.96), vec3(1.0), mare * 0.35 + 0.65);

			float limb = smoothstep(0.02, 0.9, facing);
			col = mix(vec3(0.05, 0.06, 0.09), col, limb);
			float tw = 0.035 * sin(uTime * 1.2 + vWorldPos.x * 3.5 + vWorldPos.y * 2.1);
			col += tw * (1.0 - lit) * facing;
			gl_FragColor = vec4(col, 1.0);
		}
	`,
	});
	const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(c.moonRadius, c.moonSegments, c.moonSegments), moonMat);
	moonMesh.name = "moon";
	scene.add(moonMesh);

	const L = config.lights;
	const moonLight = new THREE.DirectionalLight(L.moonLightColor, 0.0);
	moonLight.castShadow = renderStyle.shadowMapsEnabled;
	const moonShadowSz = renderStyle.compactShadowMaps ? L.moonShadowMapSizeMobile : L.moonShadowMapSize;
	moonLight.shadow.mapSize.set(moonShadowSz, moonShadowSz);
	moonLight.shadow.camera.left = -16;
	moonLight.shadow.camera.right = 16;
	moonLight.shadow.camera.top = 16;
	moonLight.shadow.camera.bottom = -16;
	moonLight.shadow.camera.near = 1;
	moonLight.shadow.camera.far = 55;
	moonLight.shadow.bias = -0.001;
	scene.add(moonLight);

	const sunMat = new THREE.MeshBasicMaterial({
		color: col.sunMesh,
		opacity: config.materials.sunMeshOpacity,
		transparent: true,
	});
	const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(c.sunRadius, c.sunSegments, c.sunSegments), sunMat);
	sunMesh.name = "sun";
	scene.add(sunMesh);

	const starCount = cnt.stars;
	const starGeo = new THREE.BufferGeometry();
	const starPos = new Float32Array(starCount * 3);
	// Uniform points on a sphere (infinite-distance star field). Allows stars down to the
	// astronomical horizon as the celestial shell rotates — unlike the old upper-dome-only layout.
	for (let i = 0; i < starCount; i++) {
		const u = rng() * Math.PI * 2;
		const v = rng();
		const cosPhi = 2 * v - 1;
		const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
		const r = c.starRadiusMin + rng() * c.starRadiusExtra;
		starPos[i * 3] = r * sinPhi * Math.cos(u);
		starPos[i * 3 + 1] = r * cosPhi;
		starPos[i * 3 + 2] = r * sinPhi * Math.sin(u);
	}
	starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
	const starMat = new THREE.PointsMaterial({
		color: 0xffffff,
		size: c.starPointSize,
		sizeAttenuation: true,
		transparent: true,
		opacity: 0,
	});
	const starPoints = new THREE.Points(starGeo, starMat);
	celestialShell.add(starPoints);

	const fallingStars = [];
	const fs = c.fallingStar;
	let nextFallingStarTime = performance.now() + fs.nextDelayMinMs + Math.random() * fs.nextDelayExtraMs;
	const cometDir = new THREE.Vector3();
	const cometQuat = new THREE.Quaternion();

	function createFallingStar() {
		const comet = new THREE.Group();
		const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
		const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), headMat);
		comet.add(head);

		const tailGeo = new THREE.BufferGeometry().setAttribute(
			"position",
			new THREE.BufferAttribute(new Float32Array([0, 0, 0, -1.1, -0.18, 0]), 3),
		);
		const tail = new THREE.Line(tailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
		comet.add(tail);

		const startX = (Math.random() > 0.5 ? -1 : 1) * (24 + Math.random() * 14);
		const startY = 14 + Math.random() * 9;
		const startZ = (Math.random() - 0.5) * 22;
		const endX = -Math.sign(startX) * (20 + Math.random() * 8);
		const endY = 4 + Math.random() * 5;
		const endZ = startZ + (Math.random() - 0.5) * 12;
		const duration = 1.2 + Math.random() * 1.2;

		comet.position.set(startX, startY, startZ);
		comet.userData.velocity = new THREE.Vector3((endX - startX) / duration, (endY - startY) / duration, (endZ - startZ) / duration);
		comet.userData.life = duration;
		comet.userData.age = 0;

		cometDir.copy(comet.userData.velocity).normalize();
		cometQuat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), cometDir);
		comet.setRotationFromQuaternion(cometQuat);

		scene.add(comet);
		fallingStars.push(comet);
	}

	function updateFallingStars(dt) {
		const now = performance.now();
		if (now >= nextFallingStarTime) {
			createFallingStar();
			nextFallingStarTime = now + fs.nextDelayMinMs + Math.random() * fs.updateNextDelayExtraMs;
		}
		for (let i = fallingStars.length - 1; i >= 0; i--) {
			const comet = fallingStars[i];
			comet.userData.age += dt;
			comet.position.x += comet.userData.velocity.x * dt;
			comet.position.y += comet.userData.velocity.y * dt;
			comet.position.z += comet.userData.velocity.z * dt;
			const fade = Math.max(0, 1 - comet.userData.age / comet.userData.life);
			comet.children.forEach((child) => {
				if (child.material) child.material.opacity = fade * 0.9;
			});
			if (comet.userData.age >= comet.userData.life) {
				scene.remove(comet);
				fallingStars.splice(i, 1);
			}
		}
	}

	return {
		clouds,
		moonMesh,
		moonLight,
		moonShaderUniforms,
		sunMesh,
		sunMat,
		starMat,
		updateFallingStars,
	};
}
