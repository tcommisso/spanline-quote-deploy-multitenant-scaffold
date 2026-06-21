SET @migration_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'blind_fabric_colours' AND column_name = 'swatchUrl') = 0, 'ALTER TABLE `blind_fabric_colours` ADD COLUMN `swatchUrl` varchar(255) NULL AFTER `hexCode`', 'SELECT 1');
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TEMPORARY TABLE `tmp_blind_fabric_swatch_seed` (
  `fabricRangeName` varchar(128) NOT NULL,
  `categoryNumber` varchar(16) NOT NULL,
  `name` varchar(128) NOT NULL,
  `swatchUrl` varchar(255) NOT NULL
);

INSERT INTO `tmp_blind_fabric_swatch_seed` (`fabricRangeName`, `categoryNumber`, `name`, `swatchUrl`) VALUES
('Ombra 6% Fabric', '1', 'Surfmist® 502', '/assets/blinds/fabric-swatches/ombra-6-fabric-surfmist-502.jpg'),
('Ombra 6% Fabric', '1', 'Flint 509', '/assets/blinds/fabric-swatches/ombra-6-fabric-flint-509.jpg'),
('Ombra 6% Fabric', '1', 'Moonlight 510', '/assets/blinds/fabric-swatches/ombra-6-fabric-moonlight-510.jpg'),
('Ombra 6% Fabric', '1', 'Mocha 533', '/assets/blinds/fabric-swatches/ombra-6-fabric-mocha-533.jpg'),
('Ombra 6% Fabric', '1', 'Basalt® 541', '/assets/blinds/fabric-swatches/ombra-6-fabric-basalt-541.jpg'),
('Ombra 6% Fabric', '1', 'Monument® 542', '/assets/blinds/fabric-swatches/ombra-6-fabric-monument-542.jpg'),
('Ombra 6% Fabric', '1', 'Blackstone 553', '/assets/blinds/fabric-swatches/ombra-6-fabric-blackstone-553.jpg'),
('Ombra 6% Fabric', '1', 'Platinum 564', '/assets/blinds/fabric-swatches/ombra-6-fabric-platinum-564.jpg'),
('Ombra 6% Fabric', '1', 'Alpaca 566', '/assets/blinds/fabric-swatches/ombra-6-fabric-alpaca-566.jpg'),
('Ombra 1% Fabric', '2', 'Surfmist® 702', '/assets/blinds/fabric-swatches/ombra-1-fabric-surfmist-702.jpg'),
('Ombra 1% Fabric', '2', 'Flint 709', '/assets/blinds/fabric-swatches/ombra-1-fabric-flint-709.jpg'),
('Ombra 1% Fabric', '2', 'Moonlight 710', '/assets/blinds/fabric-swatches/ombra-1-fabric-moonlight-710.jpg'),
('Ombra 1% Fabric', '2', 'Basalt® 741', '/assets/blinds/fabric-swatches/ombra-1-fabric-basalt-741.jpg'),
('Ombra 1% Fabric', '2', 'Monument® 742', '/assets/blinds/fabric-swatches/ombra-1-fabric-monument-742.jpg'),
('Ombra 1% Fabric', '2', 'Blackstone 753', '/assets/blinds/fabric-swatches/ombra-1-fabric-blackstone-753.jpg'),
('Ombra 1% Fabric', '2', 'Alpaca 766', '/assets/blinds/fabric-swatches/ombra-1-fabric-alpaca-766.jpg'),
('Ombra 1% Fabric', '2', 'Platinum 764', '/assets/blinds/fabric-swatches/ombra-1-fabric-platinum-764.jpg'),
('Mode 95', '2', 'Surfmist® 502', '/assets/blinds/fabric-swatches/mode-95-surfmist-502.jpg'),
('Mode 95', '2', 'Deep Sea 503', '/assets/blinds/fabric-swatches/mode-95-deep-sea-503.jpg'),
('Mode 95', '2', 'Spice 504', '/assets/blinds/fabric-swatches/mode-95-spice-504.jpg'),
('Mode 95', '2', 'Silver Sky 505', '/assets/blinds/fabric-swatches/mode-95-silver-sky-505.jpg'),
('Mode 95', '2', 'Bamboo 507', '/assets/blinds/fabric-swatches/mode-95-bamboo-507.jpg'),
('Mode 95', '2', 'Nougat 508', '/assets/blinds/fabric-swatches/mode-95-nougat-508.jpg'),
('Mode 95', '2', 'Flint 509', '/assets/blinds/fabric-swatches/mode-95-flint-509.jpg'),
('Mode 95', '2', 'Moonlight 510', '/assets/blinds/fabric-swatches/mode-95-moonlight-510.jpg'),
('Mode 95', '2', 'Chalk 517', '/assets/blinds/fabric-swatches/mode-95-chalk-517.jpg'),
('Mode 95', '2', 'Greystone 526', '/assets/blinds/fabric-swatches/mode-95-greystone-526.jpg'),
('Mode 95', '2', 'Wheat 529', '/assets/blinds/fabric-swatches/mode-95-wheat-529.jpg'),
('Mode 95', '2', 'Mocha 533', '/assets/blinds/fabric-swatches/mode-95-mocha-533.jpg'),
('Mode 95', '2', 'Windspray ® 538', '/assets/blinds/fabric-swatches/mode-95-windspray-538.jpg'),
('Mode 95', '2', 'Shale Grey® 539', '/assets/blinds/fabric-swatches/mode-95-shale-grey-539.jpg'),
('Mode 95', '2', 'Woodland Grey® 540', '/assets/blinds/fabric-swatches/mode-95-woodland-grey-540.jpg'),
('Mode 95', '2', 'Basalt® 541', '/assets/blinds/fabric-swatches/mode-95-basalt-541.jpg'),
('Mode 95', '2', 'Monument® 542', '/assets/blinds/fabric-swatches/mode-95-monument-542.jpg'),
('Mode 95', '2', 'Eclipse 544', '/assets/blinds/fabric-swatches/mode-95-eclipse-544.jpg'),
('Mode 95', '2', 'Ash 551', '/assets/blinds/fabric-swatches/mode-95-ash-551.jpg'),
('Mode 95', '2', 'Blackstone 553', '/assets/blinds/fabric-swatches/mode-95-blackstone-553.jpg'),
('Mode 95', '2', 'Alpaca 566', '/assets/blinds/fabric-swatches/mode-95-alpaca-566.jpg'),
('Mode 95', '2', 'Forest Green 559', '/assets/blinds/fabric-swatches/mode-95-forest-green-559.jpg'),
('Mode 95', '2', 'Platinum 564', '/assets/blinds/fabric-swatches/mode-95-platinum-564.jpg'),
('Mode 95', '2', 'Porcelain 572', '/assets/blinds/fabric-swatches/mode-95-porcelain-572.jpg'),
('Mode 95', '2', 'Marzipan 575', '/assets/blinds/fabric-swatches/mode-95-marzipan-575.jpg'),
('Mode 95', '2', 'Pale Eucalypt® 580', '/assets/blinds/fabric-swatches/mode-95-pale-eucalypt-580.jpg'),
('Mode 95', '2', 'Maroon 597', '/assets/blinds/fabric-swatches/mode-95-maroon-597.jpg'),
('Skyline 99', '2', 'Ebony 400', '/assets/blinds/fabric-swatches/skyline-99-ebony-400.jpg'),
('Skyline 99', '2', 'Gunmetal 401', '/assets/blinds/fabric-swatches/skyline-99-gunmetal-401.jpg'),
('Skyline 99', '2', 'Chestnut 402', '/assets/blinds/fabric-swatches/skyline-99-chestnut-402.jpg'),
('Skyline 99', '2', 'Storm 403', '/assets/blinds/fabric-swatches/skyline-99-storm-403.jpg'),
('Skyline 99', '2', 'Paperbark 404', '/assets/blinds/fabric-swatches/skyline-99-paperbark-404.jpg'),
('Skyline 99', '2', 'Desert 406', '/assets/blinds/fabric-swatches/skyline-99-desert-406.jpg'),
('Skyline 99', '2', 'Black Opal 407', '/assets/blinds/fabric-swatches/skyline-99-black-opal-407.jpg'),
('Skyline 99', '2', 'Shadow 408', '/assets/blinds/fabric-swatches/skyline-99-shadow-408.jpg'),
('Skyline 99', '2', 'Colorado 409', '/assets/blinds/fabric-swatches/skyline-99-colorado-409.jpg'),
('Skyline 99', '2', 'Basalt® 411', '/assets/blinds/fabric-swatches/skyline-99-basalt-411.jpg'),
('Skyline 99', '2', 'Monument® 412', '/assets/blinds/fabric-swatches/skyline-99-monument-412.jpg');

UPDATE `blind_fabric_colours` AS `colour`
JOIN `tmp_blind_fabric_swatch_seed` AS `seed`
  ON `colour`.`fabricRangeName` = `seed`.`fabricRangeName`
  AND `colour`.`categoryNumber` = `seed`.`categoryNumber`
  AND `colour`.`name` = `seed`.`name`
SET `colour`.`swatchUrl` = `seed`.`swatchUrl`;

DROP TEMPORARY TABLE `tmp_blind_fabric_swatch_seed`;
