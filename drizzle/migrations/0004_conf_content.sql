-- Fill radio/checkbox option labels (conf_content), aligned with original install data
UPDATE conf SET conf_content = '精准搜索=>0
模糊搜索=>1
分词搜索=>2', conf_desc = '精准：关键词都包含且顺序相关；模糊：顺序可变；分词：满足其一即可' WHERE conf_key = 'search_type';

UPDATE conf SET conf_content = '无图模式=>0
有图模式=>1' WHERE conf_key = 'ranking_type';

UPDATE conf SET conf_content = '开启=>0
关闭=>1', conf_desc = '前台是否开启提交需求' WHERE conf_key = 'app_demand';

UPDATE conf SET conf_content = '显示=>0
隐藏=>1', conf_desc = 'logo 含文字时可隐藏网站名称' WHERE conf_key = 'app_name_hide';

UPDATE conf SET conf_content = '开启=>0
关闭=>1', conf_desc = '仅无图模式有效' WHERE conf_key = 'home_new';

UPDATE conf SET conf_content = '关闭=>0
开启=>1' WHERE conf_key = 'is_quan';

UPDATE conf SET conf_content = '跳转+扫码=>0
仅跳转=>1
仅扫码=>2', conf_desc = '跳转：直接打开链接；扫码：提示手机扫码' WHERE conf_key = 'pc_type';

UPDATE conf SET conf_content = '转存分享=>0
第三方直链=>1', conf_desc = '第三方直链：直接展示接口返回的资源链接' WHERE conf_key = 'is_quan_type';

UPDATE conf SET conf_content = '开启=>1
关闭=>0', conf_desc = '开启后全网搜过滤失效资源（仅夸克）' WHERE conf_key = 'is_quan_zc';
