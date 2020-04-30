const webpack = require('webpack');
const merge = require('webpack-merge');
const path = require('path');
const maxAssetSize = 512 * 1024;

module.exports = async ({ config, mode }) => {
	return merge(config, {
		resolve: {
			extensions: ['.tsx', '.ts', '.js']
		},
		module: {
			rules: [
				{
					test: /\.scss$/,
					loaders: [
						'style-loader',
						'css-loader',
						{
							loader: 'postcss-loader',
							options: { config: { path: path.join(__dirname, '..') } }
						}
					]
				},
				{
					enforce: 'pre',
					test: /\.js$/,
					loader: 'source-map-loader',
					exclude: [/node_modules/]
				},
				{
					test: /\.tsx?$/,
					exclude: /node_modules/,
					loader: 'ts-loader',
					options: {
						transpileOnly: true
					}
				}
			]
		},
		// optimization: {
		// 	splitChunks: {
		// 		chunks: 'all',
		// 		minSize: 30 * 1024,
		// 		maxSize: 512 * 1024,
		// 		cacheGroups: {
		// 			vendor: {
		// 				test: /[\\/]node_modules[\\/]/,
		// 				// name(module) {
		// 				// 	const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];
		// 				// 	return `npm.${packageName.replace('@', '')}`;
		// 				// },
		// 				chunks: 'all',
		// 				reuseExistingChunk: true,
		// 				enforce: true
		// 			},
		// 		},
		// 	},
		// },
		// performance: {
		// 	maxAssetSize: maxAssetSize
		// },
	});
};
