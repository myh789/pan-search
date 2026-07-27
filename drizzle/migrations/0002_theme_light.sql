-- Align default theme with original PHP light UI
UPDATE conf SET conf_value = '#3e3e3e' WHERE conf_key = 'home_color';
UPDATE conf SET conf_value = '#133ab3' WHERE conf_key = 'home_theme';
UPDATE conf SET conf_value = '#fafafa' WHERE conf_key = 'home_background';
UPDATE conf SET conf_value = '#ffffff' WHERE conf_key = 'other_background';
