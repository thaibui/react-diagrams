const path = require('path');
const production = process.env.NODE_ENV === 'production';
const TerserPlugin = require('terser-webpack-plugin');

const maxAssetSize = 512 * 1024;
module.exports = {
	mode: production ? 'production' : 'development',
	devtool: 'inline-source-map',
	entry: './src/main.tsx',
	output: {
		path: path.join(__dirname, 'dist'),
		filename: 'bundle.js'
	},
	resolve: {
		extensions: ['.ts', '.tsx', '.js', '.jsx']
	},
	optimization: {
		minimizer: [
			new TerserPlugin({
				parallel: true,
				terserOptions: {
					ecma: 6
				}
			})
		]
	},
	module: {
		rules: [
			{
				test: /\.css$/,
				use: ['style-loader', 'css-loader']
			},
			{
				test: /\.jsx?$/,
				exclude: /node_modules/,
				use: ['babel-loader']
			},
			{
				test: /\.tsx?$/,
				loader: 'ts-loader',
				options: {
					transpileOnly: true
				}
			}
		]
	},
	optimization: {
		splitChunks: {
			chunks: 'all',
			minSize: 30 * 1024,
			maxSize: maxAssetSize,
			cacheGroups: {
				vendor: {
					test: /[\\/]node_modules[\\/]/,
					// name(module) {
					// 	const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];
					// 	return `npm.${packageName.replace('@', '')}`;
					// },
					chunks: 'all',
					reuseExistingChunk: true,
					enforce: true
				},
			},
		},
	},
	performance: {
		maxAssetSize: maxAssetSize
	},
	devServer: {
		host: '0.0.0.0',
		compress: true,
		port: 9000,
		disableHostCheck: true,
		overlay: true
	}
};
