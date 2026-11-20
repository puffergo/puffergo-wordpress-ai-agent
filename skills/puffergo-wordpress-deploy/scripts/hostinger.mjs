#!/usr/bin/env node
/**
 * Hostinger MCP 兜底桥接器
 *
 * 用途：当 WorkBuddy 官方 MCP 连接卡片连不上 Hostinger 时，用这个脚本直连。
 * 它调用的是 Hostinger 官方 @hostinger/mcp 包（Code Mode: search / execute），
 * 不是自己猜 REST API——官方包更新自动跟随，接口权威、可维护。
 *
 * 用法：
 *   node hostinger.mjs --check                       # 检查凭据是否就绪（只读，不触发下载/授权）
 *   node hostinger.mjs --login                       # 首次：弹浏览器走 OAuth，凭据落盘后退出
 *   node hostinger.mjs --search "list websites"      # 搜操作名（Code Mode 第一步）
 *   node hostinger.mjs <operation> [params-json]     # 调操作，如 hosting_websites_list
 *
 * 例：
 *   node hostinger.mjs hosting_websites_list
 *   node hostinger.mjs hosting_websites_list '{"limit":10}'
 *   node hostinger.mjs --search "create wordpress website"
 *   node hostinger.mjs execute '{"operation":"hosting_websites_list"}'
 *
 * 特性：
 * - 用 npx 从腾讯云镜像拉官方包，首次十几秒，之后走本机缓存（不联网）
 * - 凭据在 ~/.config/hostinger-mcp/credentials.json，过期由包自动刷新
 * - --check 时不下载、不授权（判断是否要走兜底用）
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const REGISTRY = 'https://mirrors.cloud.tencent.com/npm';
const PKG = '@hostinger/mcp';
const CRED = join( homedir(), '.config', 'hostinger-mcp', 'credentials.json' );

// WorkBuddy 内置 Node；在隔离 shell 里 PATH 没有 nvm，用 process.execPath 启动 npx 对应的 node
function npxCmd() {
	return platform() === 'win32' ? 'npx.cmd' : 'npx';
}

function say( s ) {
	process.stdout.write( s + '\n' );
}

/**
 * 只读检查：凭据存在且未过期 → ready；否则 need-login。
 * 不拉包、不弹浏览器，AI 用它判断要不要走兜底。
 */
function check() {
	if ( ! existsSync( CRED ) ) {
		say( 'NEED_LOGIN 凭据不存在，首次需跑 --login' );
		return;
	}
	let d;
	try {
		d = JSON.parse( readFileSync( CRED, 'utf8' ) );
	} catch ( e ) {
		say( 'NEED_LOGIN 凭据解析失败：' + e.message );
		return;
	}
	if ( ! d.access_token || ! d.refresh_token ) {
		say( 'NEED_LOGIN 凭据字段不全' );
		return;
	}
	const exp = Number( d.expires_at ) || 0;
	// 过期也没关系：包会自动用 refresh_token 续期。只有 refresh 也失效才需重登。
	say( 'READY 凭据就绪（过期时间 ' + ( exp ? new Date( exp ).toISOString() : '未知' ) + '，过期会自动刷新）' );
}

/**
 * 首次授权：跑包的 --login，它自己弹浏览器 + PKCE，凭据落 ~/.config/hostinger-mcp/
 * 输出授权 URL 让 AI 能在浏览器工具里代开（客户只需点 Allow）。
 */
function login() {
	say( 'LOGIN_START 正在启动 Hostinger 授权（首次会下载工具，稍等）' );
	const child = spawn( npxCmd(), [ '-y', PKG, '--login' ], {
		env: { ...process.env, npm_config_registry: REGISTRY },
		stdio: [ 'ignore', 'pipe', 'pipe' ],
	} );
	let seen = false;
	const scan = ( chunk ) => {
		const s = chunk.toString();
		// 包会打印授权 URL，把它透传给 AI（AI 用浏览器工具打开，客户点 Allow）
		const m = s.match( /https:\/\/auth\.hostinger\.com\/[^\s"'<>]+/ );
		if ( m && ! seen ) {
			seen = true;
			say( 'AUTH_URL ' + m[ 0 ] );
		}
		if ( /allow|success|authorized|credential|logged in/i.test( s ) ) {
			say( 'LOGIN_HINT ' + s.trim().slice( 0, 200 ) );
		}
	};
	child.stdout.on( 'data', scan );
	child.stderr.on( 'data', scan );
	child.on( 'exit', ( code ) => {
		if ( existsSync( CRED ) ) say( 'LOGIN_OK 凭据已落盘' );
		else say( 'LOGIN_PENDING 凭据未落盘，exit=' + code + '（等客户点完 Allow 再看）' );
	} );
	// 授权页要客户点 Allow，最多等 3 分钟
	setTimeout( () => {
		child.kill();
		say( 'LOGIN_TIMEOUT 3 分钟未收到授权，重跑 --login' );
		process.exit( 1 );
	}, 180000 ).unref();
}

/**
 * MCP stdio 桥：initialize → tools/call → 打印结果 → 退出。
 * operation 是 Code Mode 的真实操作名（先用 --search 拿），params 是它的参数对象。
 */
function call( operation, params ) {
	const child = spawn( npxCmd(), [ '-y', PKG ], {
		env: { ...process.env, npm_config_registry: REGISTRY },
		stdio: [ 'pipe', 'pipe', 'pipe' ],
	} );
	let buf = '';
	let done = false;
	const send = ( o ) => child.stdin.write( JSON.stringify( o ) + '\n' );

	const finish = ( text, code = 0 ) => {
		if ( done ) return;
		done = true;
		say( text );
		child.kill();
		process.exit( code );
	};

	child.stderr.on( 'data', ( d ) => {
		const s = d.toString();
		// 只在需要时提示，正常刷新凭据不噪音
		if ( /401|unauthorized|auth required|need.*login/i.test( s ) ) {
			say( 'HINT 可能需要重新授权：先跑 node hostinger.mjs --login' );
		}
	} );

	child.stdout.on( 'data', ( d ) => {
		buf += d.toString();
		let i;
		while ( ( i = buf.indexOf( '\n' ) ) >= 0 ) {
			const line = buf.slice( 0, i ).trim();
			buf = buf.slice( i + 1 );
			if ( ! line ) continue;
			let j;
			try { j = JSON.parse( line ); } catch { continue; }

			if ( j.id === 1 ) {
				send( { jsonrpc: '2.0', method: 'notifications/initialized' } );
				// --search 走 search 工具；其他都走 execute
				if ( operation === '__search__' ) {
					send( { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search', arguments: params } } );
				} else {
					send( { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'execute', arguments: params } } );
				}
			} else if ( j.id === 2 ) {
				if ( j.error ) {
					finish( 'ERROR ' + JSON.stringify( j.error ), 1 );
					return;
				}
				const text = j.result?.content?.map( ( c ) => c.text || '' ).join( '\n' )
					|| JSON.stringify( j.result ?? {} );
				finish( text );
			}
		}
	} );

	child.on( 'error', ( e ) => finish( 'ERROR 启动失败：' + e.message + '（确认已装 Node/npx）', 1 ) );

	send( { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
		protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'puffergo-fallback', version: '1.0' },
	} } );

	// 首次 npx 从国内镜像拉包十几秒，留足 90 秒
	setTimeout( () => finish( 'ERROR 超时（90s）。首次下载慢，重跑一次通常就好；still fail 检查网络或 npx', 1 ), 90000 ).unref();
}

// ---- 入口 ----
const [ cmd, ...rest ] = process.argv.slice( 2 );

if ( ! cmd || cmd === '--help' || cmd === '-h' ) {
	say( `Hostinger MCP 兜底桥接器（调官方 @hostinger/mcp，国内镜像）
用法:
  node hostinger.mjs --check                       只读检查凭据
  node hostinger.mjs --login                       首次弹浏览器授权
  node hostinger.mjs --search "list websites"      搜操作名
  node hostinger.mjs <operation> [params-json]     调操作
例:
  node hostinger.mjs hosting_websites_list
  node hostinger.mjs execute '{"operation":"hosting_websites_list"}'` );
} else if ( cmd === '--check' ) {
	check();
} else if ( cmd === '--login' ) {
	login();
} else if ( cmd === '--search' ) {
	const q = rest.join( ' ' ) || 'hosting';
	call( '__search__', { query: q } );
} else if ( cmd === 'execute' ) {
	// execute '{"operation":"...","params":{...}}' —— 原样透传给包的 execute 工具
	let params = {};
	try { params = rest[ 0 ] ? JSON.parse( rest.join( ' ' ) ) : {}; }
	catch ( e ) { say( 'ERROR params 不是合法 JSON：' + e.message ); process.exit( 1 ); }
	call( 'execute', params );
} else {
	// hosting_websites_list '{"limit":10}' —— 拼成 execute 的参数
	let params = {};
	try { params = rest[ 0 ] ? JSON.parse( rest.join( ' ' ) ) : {}; }
	catch ( e ) { say( 'ERROR params 不是合法 JSON：' + e.message ); process.exit( 1 ); }
	call( 'execute', { operation: cmd, params } );
}
