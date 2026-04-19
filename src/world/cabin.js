import * as THREE from "three";
import * as config from "../config.js";

export function buildCabin(islandGroup, materials, tilePositions, renderStyle) {
	const {
		woodMat,
		roofMat,
		doorMat,
		windowMat,
		rockMat,
		lanternGlowMat,
		snowMat,
	} = materials;

	const centerTile = tilePositions.reduce(
		(best, t) => (Math.hypot(t.x, t.z) < Math.hypot(best.x, best.z) ? t : best),
		tilePositions[0],
	);

	const cabinGroup = new THREE.Group();
	const cabinBody = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.3), woodMat);
	cabinBody.position.y = 0.55;
	cabinBody.castShadow = true;
	cabinBody.receiveShadow = true;
	cabinGroup.add(cabinBody);
	const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.8, 4), roofMat);
	roofMesh.position.y = 1.5;
	roofMesh.rotation.y = Math.PI / 4;
	roofMesh.castShadow = true;
	cabinGroup.add(roofMesh);
	const cabinSnowMaterial = snowMat.clone();
	cabinSnowMaterial.opacity = 0;
	const snowRoof = new THREE.Mesh(new THREE.ConeGeometry(1.28, 0.18, 4), cabinSnowMaterial);
	snowRoof.position.y = 1.43;
	snowRoof.rotation.y = Math.PI / 4;
	snowRoof.castShadow = false;
	cabinGroup.add(snowRoof);
	const door = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 0.05), doorMat);
	door.position.set(0, 0.35, 0.68);
	cabinGroup.add(door);
	const win1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.05), windowMat);
	win1.position.set(-0.45, 0.65, 0.68);
	cabinGroup.add(win1);
	const win2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.05), windowMat);
	win2.position.set(0.45, 0.65, 0.68);
	cabinGroup.add(win2);
	const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), rockMat);
	chimney.position.set(0.45, 1.85, -0.2);
	chimney.castShadow = true;
	cabinGroup.add(chimney);
	const lanternPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 5), woodMat);
	lanternPost.position.set(0, 0.6, 0.82);
	cabinGroup.add(lanternPost);
	const lanternBox = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.18, 0.15), lanternGlowMat);
	lanternBox.name = "lanternBox";
	lanternBox.position.set(0, 0.92, 0.82);
	cabinGroup.add(lanternBox);
	const L = config.lights;
	const cabinLight = new THREE.PointLight(L.cabinLightColor, 0.0, L.cabinLightDistance);
	cabinLight.castShadow = renderStyle.shadowMapsEnabled;
	const cabinShadowSz = renderStyle.compactShadowMaps ? L.cabinLightShadowMapSizeMobile : L.cabinLightShadowMapSize;
	cabinLight.shadow.mapSize.set(cabinShadowSz, cabinShadowSz);
	cabinLight.position.set(0, 0.95, 0.82);
	cabinGroup.add(cabinLight);

	const cb = config.cabin;
	cabinGroup.position.set(centerTile.x, centerTile.y + cb.yOffsetOnTile, centerTile.z);
	cabinGroup.scale.setScalar(cb.scale);
	islandGroup.add(cabinGroup);

	return { cabinGroup, cabinLight, cabinSnowMaterial };
}
