import * as THREE from "three";
import * as config from "../config.js";

const _tmpObj = new THREE.Object3D();

/** Sparse nearest-neighbour lookup for tile heights (cheap collision vs dense meshes). */
function buildGroundGrid(tilePositions, terrainCfg) {
	const CENTER = (terrainCfg.gridSize - 1) / 2;
	const grid = new Map();
	for (const tp of tilePositions) {
		const dx = tp.x / terrainCfg.tileSize;
		const dz = tp.z / terrainCfg.tileSize;
		const col = Math.round(dx + CENTER);
		const row = Math.round(dz + CENTER);
		grid.set(`${col},${row}`, tp.y);
	}
	return grid;
}

function groundHeightAt(x, z, grid, terrainCfg, tilePositions) {
	const CENTER = (terrainCfg.gridSize - 1) / 2;
	const col = Math.round(x / terrainCfg.tileSize + CENTER);
	const row = Math.round(z / terrainCfg.tileSize + CENTER);
	const y = grid.get(`${col},${row}`);
	if (y !== undefined) return y;
	let bestY = 0;
	let bestD = 1e9;
	for (const tp of tilePositions) {
		const d = (tp.x - x) ** 2 + (tp.z - z) ** 2;
		if (d < bestD) {
			bestD = d;
			bestY = tp.y;
		}
	}
	return bestY;
}

function getCenterTile(tilePositions) {
	return tilePositions.reduce(
		(best, t) => (Math.hypot(t.x, t.z) < Math.hypot(best.x, best.z) ? t : best),
		tilePositions[0],
	);
}

function buildTreeCylinders(treeMeshes) {
	const out = [];
	for (const tree of treeMeshes) {
		const s = tree.scale.x;
		const y0 = tree.position.y;
		out.push({
			x: tree.position.x,
			z: tree.position.z,
			yMin: y0,
			yMax: y0 + s * 2.7,
			r: s * 0.64,
		});
	}
	return out;
}

function buildCabinAabb(centerTile) {
	const cb = config.cabin;
	const s = cb.scale;
	const baseY = centerTile.y + cb.yOffsetOnTile;
	return {
		xMin: centerTile.x - 1.05 * s,
		xMax: centerTile.x + 1.05 * s,
		zMin: centerTile.z - 0.95 * s,
		zMax: centerTile.z + 0.95 * s,
		yMin: baseY - 0.05 * s,
		yMax: baseY + 2.75 * s,
	};
}

/** Small per-frame positional nudge — most escape is upward (see collisionUpBias). */
function softCylinderDelta(px, py, pz, cyl, clearance, softness, upBias) {
	const dx = px - cyl.x;
	const dz = pz - cyl.z;
	const distSq = dx * dx + dz * dz;
	const r = cyl.r + clearance;
	if (distSq >= r * r || py < cyl.yMin || py > cyl.yMax) return { dx: 0, dy: 0, dz: 0 };
	const dist = Math.sqrt(distSq);
	const penetration = r - dist;
	const nx = dx / dist;
	const nz = dz / dist;
	const horiz = penetration * softness * (1 - upBias);
	const dy = penetration * softness * upBias;
	return { dx: nx * horiz, dy: dy, dz: nz * horiz };
}

function softSphereDelta(px, py, pz, sph, clearance, softness, upBias) {
	const dx = px - sph.x;
	const dy = py - sph.y;
	const dz = pz - sph.z;
	const dist = Math.hypot(dx, dy, dz);
	const r = sph.r + clearance;
	if (dist >= r || dist < 1e-7) return { dx: 0, dy: 0, dz: 0 };
	const penetration = r - dist;
	let nx = (dx / dist) * (1 - upBias);
	let ny = (dy / dist) * (1 - upBias) + upBias;
	let nz = (dz / dist) * (1 - upBias);
	const len = Math.hypot(nx, ny, nz);
	if (len < 1e-7) return { dx: 0, dy: 0, dz: 0 };
	const k = (penetration * softness) / len;
	return { dx: nx * k, dy: ny * k, dz: nz * k };
}

function softAabbDelta(px, py, pz, box, clearance, softness, upBias) {
	const minx = box.xMin - clearance;
	const maxx = box.xMax + clearance;
	const miny = box.yMin - clearance;
	const maxy = box.yMax + clearance;
	const minz = box.zMin - clearance;
	const maxz = box.zMax + clearance;
	if (px < minx || px > maxx || py < miny || py > maxy || pz < minz || pz > maxz) {
		return { dx: 0, dy: 0, dz: 0 };
	}

	const dl = px - minx;
	const dr = maxx - px;
	const dd = py - miny;
	const du = maxy - py;
	const df = pz - minz;
	const db = maxz - pz;
	const m = Math.min(dl, dr, dd, du, df, db);

	let sx = 0;
	let sy = 0;
	let sz = 0;
	if (m === dl) sx = -1;
	else if (m === dr) sx = 1;
	else if (m === dd) sy = -1;
	else if (m === du) sy = 1;
	else if (m === df) sz = -1;
	else sz = 1;

	let ux = sx * (1 - upBias);
	let uy = sy * (1 - upBias) + upBias;
	let uz = sz * (1 - upBias);
	const len = Math.hypot(ux, uy, uz);
	if (len < 1e-7) return { dx: 0, dy: 0, dz: 0 };
	const scale = (m * softness) / len;
	return { dx: ux * scale, dy: uy * scale, dz: uz * scale };
}

function softIslandEdgeDelta(px, pz, terrainCfg, margin, softness) {
	const maxR = terrainCfg.islandRadius * margin;
	const dist = Math.hypot(px, pz);
	if (dist <= maxR || dist < 1e-6) return { dx: 0, dz: 0 };
	const pen = dist - maxR;
	const nx = px / dist;
	const nz = pz / dist;
	const s = pen * softness;
	return { dx: -nx * s, dz: -nz * s };
}

/**
 * Analytic “collision” (height field + capsules): avoids mesh raycasts — stable frame cost O(n × obstacles).
 * References: game AI obstacle avoidance, layered sine steering (lightweight Perlin substitute).
 */
export function createFireflies(islandGroup, tilePositions, treeMeshes, rockColliders, rng, embeddedDisplay) {
	const fc = config.fireflies;
	if (!fc.enabled) {
		return {
			group: new THREE.Group(),
			update() {},
		};
	}

	const terrainCfg = config.terrain;
	const embScale = config.embeddedDisplayScale.fireflies ?? 0.68;
	const count = embeddedDisplay ? Math.max(fc.embeddedMinCount, Math.round(fc.count * embScale)) : fc.count;

	const grassHalf = 0.11;
	const grid = buildGroundGrid(tilePositions, terrainCfg);
	const trees = buildTreeCylinders(treeMeshes);
	const cabinBox = buildCabinAabb(getCenterTile(tilePositions));
	const rocks = rockColliders;

	function spawnFree(px, py, pz) {
		for (const c of trees) {
			const dx = px - c.x;
			const dz = pz - c.z;
			if (dx * dx + dz * dz < (c.r + fc.clearance * 2) ** 2 && py >= c.yMin && py <= c.yMax + 0.5) {
				return false;
			}
		}
		for (const s of rocks) {
			if (
				(px - s.x) ** 2 + (py - s.y) ** 2 + (pz - s.z) ** 2 <
				(s.r + fc.clearance * 2) ** 2
			) {
				return false;
			}
		}
		if (
			px >= cabinBox.xMin - fc.clearance &&
			px <= cabinBox.xMax + fc.clearance &&
			py >= cabinBox.yMin - fc.clearance &&
			py <= cabinBox.yMax + fc.clearance &&
			pz >= cabinBox.zMin - fc.clearance &&
			pz <= cabinBox.zMax + fc.clearance
		) {
			return false;
		}
		return true;
	}

	const phases = [];
	const brightness = [];
	const positions = [];
	const velocities = [];

	for (let i = 0; i < count; i++) {
		phases.push({
			a: rng() * Math.PI * 2,
			b: rng() * Math.PI * 2,
			c: rng() * Math.PI * 2,
			d: rng() * Math.PI * 2,
			e: rng() * Math.PI * 2,
		});
		const bj = 1 - fc.brightnessJitter + rng() * fc.brightnessJitter * 2;
		brightness.push(bj);

		let px = 0;
		let py = 0;
		let pz = 0;
		let ok = false;
		for (let attempt = 0; attempt < 56 && !ok; attempt++) {
			const tile = tilePositions[Math.floor(rng() * tilePositions.length)];
			if (tile.dist > 0.94) continue;
			px = tile.x + (rng() - 0.5) * 0.85;
			pz = tile.z + (rng() - 0.5) * 0.85;
			const gh = groundHeightAt(px, pz, grid, terrainCfg, tilePositions);
			py =
				gh +
				grassHalf +
				fc.minHeightAboveGround +
				rng() * Math.min(2.5, Math.max(0.15, fc.maxHeightAboveGround - fc.minHeightAboveGround));
			ok = spawnFree(px, py, pz);
		}
		if (!ok) {
			const tile = tilePositions[Math.floor(rng() * tilePositions.length)];
			px = tile.x;
			pz = tile.z;
			py =
				tile.y +
				grassHalf +
				fc.minHeightAboveGround +
				rng() * (fc.maxHeightAboveGround - fc.minHeightAboveGround) * 0.5;
		}

		positions.push(px, py, pz);
		velocities.push((rng() - 0.5) * 0.08, (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.08);
	}

	const sphereGeo = new THREE.SphereGeometry(1, 6, 5);
	const mat = new THREE.MeshBasicMaterial({
		color: fc.color,
		transparent: true,
		opacity: fc.materialOpacity,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});

	const instanced = new THREE.InstancedMesh(sphereGeo, mat, count);
	instanced.frustumCulled = false;
	instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

	const group = new THREE.Group();
	group.name = "fireflies";
	group.add(instanced);
	islandGroup.add(group);

	const lights = [];
	const maxLights = fc.pointLightIntensity > 0 ? Math.min(fc.maxPointLights, count) : 0;
	for (let i = 0; i < maxLights; i++) {
		const pl = new THREE.PointLight(fc.color, fc.pointLightIntensity, fc.pointLightDistance, fc.pointLightDecay);
		pl.castShadow = false;
		group.add(pl);
		lights.push(pl);
	}

	for (let i = 0; i < count; i++) {
		const ix = i * 3;
		_tmpObj.position.set(positions[ix], positions[ix + 1], positions[ix + 2]);
		_tmpObj.scale.setScalar(fc.instanceScale * brightness[i]);
		_tmpObj.updateMatrix();
		instanced.setMatrixAt(i, _tmpObj.matrix);
	}
	instanced.instanceMatrix.needsUpdate = true;

	function integrate(ix, t, dt, motionScale) {
		const fc = config.fireflies;
		const i = ix * 3;
		let px = positions[i];
		let py = positions[i + 1];
		let pz = positions[i + 2];
		let vx = velocities[i];
		let vy = velocities[i + 1];
		let vz = velocities[i + 2];

		const ph = phases[ix];
		const f1 = fc.wanderFreq1 * motionScale;
		const f2 = fc.wanderFreq2 * motionScale;
		const ax =
			(Math.sin(t * f1 + ph.a) + Math.cos(t * f2 * 0.7 + ph.b)) * 0.5 * fc.wanderAccel * motionScale;
		const az =
			(Math.cos(t * f1 * 0.85 + ph.c) + Math.sin(t * f2 + ph.d)) * 0.5 * fc.wanderAccel * motionScale;
		const ay =
			Math.sin(t * (f1 * 0.55) + ph.e) * 0.35 * fc.wanderAccel * motionScale * 0.45;

		vx += ax * dt;
		vy += ay * dt;
		vz += az * dt;

		const lift = fc.collisionLiftAccel ?? 5;
		const radDamp = fc.collisionRadialDamp ?? 0.55;

		const ghPre = groundHeightAt(px, pz, grid, terrainCfg, tilePositions);
		const floorPre = ghPre + grassHalf + fc.minHeightAboveGround;
		const ceilPre = ghPre + grassHalf + fc.maxHeightAboveGround;
		const gLift = fc.groundLiftAccel ?? lift;
		const gCeil = fc.groundCeilingAccel ?? gLift;
		const gNormDamp = fc.groundVelocityNormalDamp ?? radDamp;
		const penCap = fc.groundLiftPenCap ?? 0.42;

		if (py < floorPre) {
			const pen = floorPre - py;
			const pw = Math.min(pen, penCap);
			vy += gLift * pw * dt * motionScale;
			if (vy < 0) vy -= vy * gNormDamp * Math.min(1, pen * 2.4);
		}
		if (py > ceilPre) {
			const pen = py - ceilPre;
			const pw = Math.min(pen, penCap);
			vy -= gCeil * pw * dt * motionScale;
			if (vy > 0) vy -= vy * gNormDamp * Math.min(1, pen * 2.4);
		}

		for (const c of trees) {
			const dx = px - c.x;
			const dz = pz - c.z;
			const horizDist = Math.hypot(dx, dz);
			const r = c.r + fc.clearance;
			if (py >= c.yMin && py <= c.yMax && horizDist < r && horizDist > 1e-6) {
				const pen = r - horizDist;
				const nx = dx / horizDist;
				const nz = dz / horizDist;
				vy += lift * pen * dt * motionScale;
				const inward = vx * nx + vz * nz;
				if (inward < 0) {
					vx -= nx * inward * radDamp;
					vz -= nz * inward * radDamp;
				}
			}
		}

		for (const s of rocks) {
			const dx = px - s.x;
			const dy = py - s.y;
			const dz = pz - s.z;
			const dist = Math.hypot(dx, dy, dz);
			const rr = s.r + fc.clearance;
			if (dist < rr && dist > 1e-7) {
				const pen = rr - dist;
				vy += lift * pen * dt * motionScale * 0.9;
				const nx = dx / dist;
				const ny = dy / dist;
				const nz = dz / dist;
				const vn = vx * nx + vy * ny + vz * nz;
				if (vn < 0) {
					vx -= nx * vn * radDamp;
					vy -= ny * vn * radDamp * 0.7;
					vz -= nz * vn * radDamp;
				}
			}
		}

		{
			const cx = fc.clearance;
			const minx = cabinBox.xMin - cx;
			const maxx = cabinBox.xMax + cx;
			const miny = cabinBox.yMin - cx;
			const maxy = cabinBox.yMax + cx;
			const minz = cabinBox.zMin - cx;
			const maxz = cabinBox.zMax + cx;
			if (px >= minx && px <= maxx && py >= miny && py <= maxy && pz >= minz && pz <= maxz) {
				vy += lift * dt * motionScale * 0.4;
			}
		}

		const velDamp = Math.exp(-fc.velocityDamping * dt);
		vx *= velDamp;
		vy *= velDamp;
		vz *= velDamp;

		const sp = Math.hypot(vx, vy, vz);
		const ms = fc.maxSpeed * motionScale;
		if (sp > ms && sp > 1e-6) {
			const k = ms / sp;
			vx *= k;
			vy *= k;
			vz *= k;
		}

		px += vx * dt;
		py += vy * dt;
		pz += vz * dt;

		const edgeS = fc.edgeSoftness ?? 0.28;
		const eD = softIslandEdgeDelta(px, pz, terrainCfg, fc.islandRadiusMargin, edgeS);
		px += eD.dx;
		pz += eD.dz;

		const gh = groundHeightAt(px, pz, grid, terrainCfg, tilePositions);
		const groundCeiling = gh + grassHalf + fc.maxHeightAboveGround;
		const floorY = gh + grassHalf + fc.minHeightAboveGround;

		const soft = fc.collisionSoftness ?? 0.22;
		const upB = fc.collisionUpBias ?? 0.86;
		let sdx = 0;
		let sdy = 0;
		let sdz = 0;
		for (const c of trees) {
			const d = softCylinderDelta(px, py, pz, c, fc.clearance, soft, upB);
			sdx += d.dx;
			sdy += d.dy;
			sdz += d.dz;
		}
		for (const s of rocks) {
			const d = softSphereDelta(px, py, pz, s, fc.clearance, soft, upB);
			sdx += d.dx;
			sdy += d.dy;
			sdz += d.dz;
		}
		{
			const d = softAabbDelta(px, py, pz, cabinBox, fc.clearance, soft, upB);
			sdx += d.dx;
			sdy += d.dy;
			sdz += d.dz;
		}
		px += sdx;
		py += sdy;
		pz += sdz;

		const gSoft = fc.groundCollisionSoftness ?? fc.collisionSoftness ?? 0.22;
		if (py < floorY) {
			const depth = floorY - py;
			py += depth * Math.min(1, gSoft);
			if (vy < 0) vy -= vy * gNormDamp * 0.32 * Math.min(1, depth * 1.6);
		}
		if (py > groundCeiling) {
			const depth = py - groundCeiling;
			py -= depth * Math.min(1, gSoft);
			if (vy > 0) vy -= vy * gNormDamp * 0.32 * Math.min(1, depth * 1.6);
		}

		positions[i] = px;
		positions[i + 1] = py;
		positions[i + 2] = pz;
		velocities[i] = vx;
		velocities[i + 1] = vy;
		velocities[i + 2] = vz;
	}

	return {
		group,
		update(dt, elapsed, nightFactor, prefersReducedMotion) {
			const fc2 = config.fireflies;
			const motionScale = prefersReducedMotion ? fc2.reducedMotionScale : 1;

			const visRaw = THREE.MathUtils.clamp(
				(nightFactor - fc2.nightVisibilityStart) / Math.max(1e-5, fc2.nightVisibilityRange),
				0,
				1,
			);
			group.visible = visRaw > 0.001;
			mat.opacity = fc2.materialOpacity * visRaw;

			const flutterAmp = fc2.flickerFlutterAmp ?? 0;
			const flutterFreq = fc2.flickerFlutterFreq ?? 1.5;
			const pulseBase =
				1 +
				Math.sin(elapsed * fc2.flickerFreq1) * fc2.flickerAmp * 0.5 +
				Math.sin(elapsed * fc2.flickerFreq2 + 1.7) * fc2.flickerAmp * 0.5;

			for (let i = 0; i < count; i++) {
				integrate(i, elapsed, dt, motionScale);
				const ix = i * 3;
				const px = positions[ix];
				const py = positions[ix + 1];
				const pz = positions[ix + 2];

				const pulse = pulseBase * (1 + flutterAmp * Math.sin(elapsed * flutterFreq + phases[i].a));
				const scl = fc2.instanceScale * brightness[i] * pulse * (0.55 + 0.45 * visRaw);

				_tmpObj.position.set(px, py, pz);
				_tmpObj.scale.setScalar(scl);
				_tmpObj.updateMatrix();
				instanced.setMatrixAt(i, _tmpObj.matrix);

				if (i < lights.length) {
					lights[i].position.set(px, py, pz);
					lights[i].intensity =
						fc2.pointLightIntensity * brightness[i] * pulse * visRaw * fc2.lightEmissionScale;
					lights[i].visible = visRaw > 0.02;
				}
			}

			instanced.instanceMatrix.needsUpdate = true;
		},
	};
}
