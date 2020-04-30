import { storiesOf, addParameters, addDecorator } from '@storybook/react';
import { setOptions } from '@storybook/addon-options';
import { themes } from '@storybook/theming';
import './demos/helpers/index.css';
import { Toolkit } from '@projectstorm/react-canvas-core';

Toolkit.TESTING = true;

addParameters({
	options: {
		theme: themes.dark
	}
});

setOptions({
	name: 'STORM React Diagrams',
	url: 'https://github.com/projectstorm/react-diagrams',
	addonPanelInRight: true
});

addDecorator(fn => {
	Toolkit.TESTING_UID = 0;
	return fn();
});

import recruiting_high_level from './demos/demo-recruiting-high-level';
import employee_position_data from './demos/demo-employee-position-data';

storiesOf('People Insights', module)
	.add('Recruiting (high-level)', recruiting_high_level)
	.add('Employee Position Data', employee_position_data);
