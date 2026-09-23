-- The integration suite owns its own database and truncates it between cases.
CREATE DATABASE IF NOT EXISTS `glampro_test`;
GRANT ALL PRIVILEGES ON `glampro_test`.* TO 'glampro'@'%';
FLUSH PRIVILEGES;
