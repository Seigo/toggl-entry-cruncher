/**

 _____                 _   _____                       _               
|_   _|               | | /  __ \                     | |              
  | | ___   __ _  __ _| | | /  \/_ __ _   _ _ __   ___| |__   ___ _ __ 
  | |/ _ \ / _` |/ _` | | | |   | '__| | | | '_ \ / __| '_ \ / _ \ '__|
  | | (_) | (_| | (_| | | | \__/\ |  | |_| | | | | (__| | | |  __/ |   
  \_/\___/ \__, |\__, |_|  \____/_|   \__,_|_| |_|\___|_| |_|\___|_|   
            __/ | __/ |                                                
           |___/ |___/                                                 
v.1.0.0.0

REQUIREMENTS:
	1. Redmine: generate API key
	2. Toggl.com account
	3. Setup Toggl tags with Redmine's Activities
	4. Create entries in Toggl strictly:
		4.1. Description starting with the Redmine Issue's ID *and at least ONE space* (Or only "#" if it doesn't have a Issue):
			#65432 Bug where foo bars
			# Some urgent thing that I came across
		4.2. Tag with the type of Activity (see item 3). More tags can be assigned, but this program might misbehave.
		4.3. Always put tags
		4.4. Do not use quotes -> "" or ''
	5. Go to toggl and export a Detailed Report
	6. ???
	7. Profit!

*/

var fs = require('fs');
var mysql = require('mysql');

var main = {};

/*
CREATE TABLE input (
	id bigint(20) NOT NULL AUTO_INCREMENT,
	user text,
	email text,
	client text,
	project text,
	description text,
	billable text,
	start_date timestamp,
	start_time timestamp,
	end_date timestamp,
	end_time timestamp,
	duration_seconds bigint(20),
	tags text,
	amount text,
	PRIMARY KEY (id)
) ENGINE=InnoDb DEFAULT CHARSET=utf8;
*/

main.initializeDatabase = function (callback) {
	main.dbConn = mysql.createConnection({
		host: 'localhost',
		database: 'toggl_cruncher',
		user: 'root',
		password: '74z4n1'
	});
	main.dbConn.connect();
	main.dbConn.query('TRUNCATE input',
				function (err, a, b, c) {
					if (err) throw err;
					console.log('Table \'input\' from databse \'toggl_cruncher\' truncated.');
					callback();
				});
}

main.consumeFile = function (callback) {
	fs.readFile('input/Toggl_time_entries_2016-07-01_to_2016-07-29.csv', 'utf8', function (err, data) {
		if (err) {
			console.log(err);
		} else {
			console.log('Input received');
			// console.log(data);
			console.log('JSON-ifying input..');

			var query = 'INSERT INTO input' +
				' (user, email, client, project, task, description, billable, start_date, start_time, end_date, end_time, duration_seconds, tags, amount)' +
				' VALUES ' + main.createInsertRowsPredicate(data.split('\n'));

			main.dbConn.query(query,
				function (err, a, b, c) {
					if (err) throw err;
					console.log('Lines inserted');
					callback();
				});
		}
	});
};

main.createInsertRowsPredicate = function (lines) {
	var predicate = [];

	lines.forEach(function (elem, index, array) { 
		if (index === 0 || elem === undefined || elem === '') {
			console.log('Line skipped: ' + (index + 1));
			return;
		}

		var columns = elem.split(',');
		
		var user = columns[0];
		var email = columns[1];
		var client = columns[2];
		var project = columns[3];
		var task = columns[4];
		var description = columns[5];
		var billable = columns[6];
		var start_date = columns[7];
		var start_time = columns[8];
		var end_date = columns[9];
		var end_time = columns[10];
		var duration = columns[11];
		var tags = columns[12];
		var amount = columns[13];

		var formattedColumns = [];
		formattedColumns.push(user);
		formattedColumns.push(email);
		formattedColumns.push(client);
		formattedColumns.push(project);
		formattedColumns.push(task);
		formattedColumns.push(description);
		formattedColumns.push(billable);
		formattedColumns.push(start_date);
		formattedColumns.push(start_date + ' ' + start_time);
		formattedColumns.push(end_date);
		formattedColumns.push(end_date + ' ' + end_time);

		var duration_seconds = 0;
		if (duration) {
			var tmp_array = duration.split(':');
			duration_seconds = 
					(3600 * tmp_array[0]) + 
					(60 * tmp_array[1]) +
					(tmp_array[2]);
		}

		formattedColumns.push(duration_seconds);
		formattedColumns.push(tags);
		formattedColumns.push(amount);

		formattedColumns.forEach(function (elem, index, array) {
			array[index] = '\'' + elem + '\'';
		});

		predicate.push('(' + formattedColumns.join(',') + ')');
	});
	return predicate.join(',');
};

main.parseActivity = function (activity_name) {
	switch (activity_name) {
		case 'Análise': return 8;
		case 'Desenvolvimento': return 9;
		case 'Pesquisa': return 255;
		case 'Testes de Dev': return 126;
		case 'Acompanhamento': return 146;
		case 'Documentação': return 127;
		case 'Homologação': return 14;
		case 'Implantação': return 11;
		case 'Chamados': return 128;
		case 'Suporte': return 13;
		case 'Reuniões': return 129;
		case 'Outros': return 130;
		case 'Janela Operacional': return 648;
		case 'Suporte Interno HAR': return 804;
		default: return 0;
	}
}

main.assemblePosts = function (callback) {
	console.log('Assembling posts..');

	var query = 'SELECT user, client, project, description, start_date, SUM(duration_seconds) AS duration_seconds, tags' +
			' FROM input' +
			' WHERE start_date > \'2016-01-01 00:00:00\'' +
			' AND description NOT LIKE \'%Vivido%\'' +
			' GROUP BY start_date, description';

	main.dbConn.query(query,
		function (err, rows, fields) {
			if (err) {
				throw err;
			} else {
				rows.forEach(function (row, index, allRows) {
					if (row === '') {
						return;
					}

					var description = row.description;

					var issue_id = main.parseIssueId(description);
					// var issue_id = 'DUMMY';

					var start_year = row.start_date.getUTCFullYear();
					var start_month = (row.start_date.getUTCMonth() + 1);
					var start_day = row.start_date.getUTCDate();

					var start_date = '' + start_year + '-'
							+ (start_month < 10 ? ('0' + start_month) : start_month) + '-'
							+ (start_day < 10 ? ('0' + start_day) : start_day);
					var duration_seconds = row.duration_seconds;
					var tags = row.tags;

					var activity_id = main.parseActivity(tags.split(',')[0]);
					// var activity_id = 'Another dummy';

					var curl = main.assembleCurl('ae5d9acc79167a5a9d4a6ae26936a08dcf15cfaa',
							'dev', issue_id,
							start_date,
							(duration_seconds / (3600 * 100 /*dunno why*/ )),
							activity_id,
							description);

					console.log(curl);
				});

				callback();
			}
		});
};

main.parseIssueId = function (description) {
	return description.split(' ')[0].replace('#', '');
};

main.assembleCurl = function (redmine_api_key, project_id, issue_id, start_date, duration_hours, activity_id, description) {
	var curl = 'curl' +
			' -X POST' +
			' -H \"Content-type:application/json\"' +
			' -H \"X-Redmine-API-Key:' + redmine_api_key + '\"' +
			' http://redmine.lan.veltec.com.br/time_entries.xml' +
			' -d \"{\\\"time_entry\\\": ';

	if (issue_id === '') {
		curl += '{\\\"project_id\\\": \\\"' + project_id + '\\\",';
					
	} else {
		curl += '{\\\"issue_id\\\": ' + issue_id + ',';
	}

	curl += '\\\"spent_on\\\": \\\"' + start_date + '\\\",' +
					'\\\"hours\\\": ' + duration_hours + ',' +
					'\\\"activity_id\\\": ' + activity_id + ',' +
					'\\\"comments\\\": \\\"' + description + '\\\"' +
					'}}\"';
	return curl;
};

main.run = function () {
	main.initializeDatabase(function () {
		main.consumeFile(function () {
			main.assemblePosts(function () {
				console.log('Finished.');
				process.exit(0);
			});
		});
	});

	/* *Manually* UPDATE tasks, activity FROM input */
	// -> Or you can require that user inputs tags and description correctly

	/* File is consumed, then: */
	// main.assemblePosts(function () {
	// 		process.exit(0);
	// });

	/* Assemblying from custom input, to deal with the lack of standardized tags and description */
	// fs.readFile('input/formatted', 'utf8', function (err, data) {
	// 	data.split('\n').forEach(function (line, index, allLines) {
	// 		if (line === '') {
	// 			return;
	// 		}
	// 		var columns = line.split(' | ');
	// 		var activity_name = columns[0];
	// 		var description = columns[1];
	// 		var start_date = columns[2];
	// 		var duration_hours = columns[3];
	// 		var issue_id = main.parseIssueId(description);
	// 		var activity_id = main.parseActivity(activity_name);
	// 		var curl = main.assembleCurl('ae5d9acc79167a5a9d4a6ae26936a08dcf15cfaa',
	// 						'dev', issue_id,
	// 						start_date,
	// 						duration_hours,
	// 						activity_id,
	// 						description);
	// 		console.log(curl);
	// 	});
	// });
};

main.run();

// Adaptando tags e description
/*
UPDATE input SET tags = 'Desenvolvimento', description = '#55643 Desenvolvimento GVM: Melhorias' WHERE id = 13;
*/

// POST com horas erradas
/*
curl -X POST -H "Content-type:application/json" -H "X-Redmine-API-Key:ae5d9acc79167a5a9d4a6ae26936a08dcf15cfaa" 
http://redmine.lan.veltec.com.br/time_entries.xml -d 
"{\"time_entry\": {\"issue_id\": 55643,\"spent_on\": \"2016-06-06\",\"hours\": 3.3333,\"activity_id\": 9,
\"comments\": \"#55643 Desenvolvimento GVM: Melhorias\"}}"
*/

// PUT with correction
/*
curl -X PUT -H "Content-type:application/json" -H "X-Redmine-API-Key:ae5d9acc79167a5a9d4a6ae26936a08dcf15cfaa" 
http://redmine.lan.veltec.com.br/time_entries/64032.xml -d 
"{\"time_entry\": {\"issue_id\": 55643,\"spent_on\": \"2016-06-06\",\"hours\": 7.8,\"activity_id\": 9,
\"comments\": \"#55643 Desenvolvimento GVM: Melhorias\"}}"
*/

// PESQUISA DA DOCUMENTACAO
/*

-H "X-Redmine-API-Key:ae5d9acc79167a5a9d4a6ae26936a08dcf15cfaa"

POST /time_entries.xml
Creates a time entry.

Parameters:

time_entry (required): a hash of the time entry attributes, including:
	issue_id or project_id (only one is required): the issue id or project id to log time on
	spent_on: the date the time was spent (default to the current date)
	hours (required): the number of spent hours
	activity_id: the id of the time activity. This parameter is required unless a default activity is defined in Redmine.
	comments: short description for the entry (255 characters max)


➜  ~ curl -X POST -H "Content-type:application/json" -H "X-Redmine-API-Key:ae5d9acc79167a5a9d4a6ae26936a08dcf15cfaa" http://redmine.lan.veltec.com.br/time_entries.xml -d "{\"time_entry\": {\"issue_id\": 55570,\"spent_on\": \"2016-07-01\",\"hours\": 0.01,\"activity_id\": 9,\"comments\": \"cruncher test\"}}" 
<?xml version="1.0" encoding="UTF-8"?><time_entry><id>64000</id><project id="140" name="Dev Unificado"/><issue id="55570"/><user id="129" name="Guilherme Seigo Osawa"/><hours>0.01</hours><comments>cruncher test</comments><spent_on>2016-07-01</spent_on><created_on>2016-07-01T14:52:59-03:00</created_on><updated_on>2016-07-01T14:52:59-03:00</updated_on></time_entry>%

curl -X GET  /issues.xml

➜  ~ curl -X POST -H "Content-type:application/json" -H "X-Redmine-API-Key:ae5d9acc79167a5a9d4a6ae26936a08dcf15cfaa" http://redmine.lan.veltec.com.br/time_entries.xml -d "{\"time_entry\": {\"project_id\": \"dev\",\"spent_on\": \"2016-07-01\",\"hours\": 0.01,\"activity_id\": 9,\"comments\": \"cruncher test\"}}"                                                                                                                                          
<?xml version="1.0" encoding="UTF-8"?><time_entry><id>64022</id><project id="140" name="Dev Unificado"/><user id="129" name="Guilherme Seigo Osawa"/><activity id="9" name="Desenvolvimento"/><hours>0.01</hours><comments>cruncher test</comments><spent_on>2016-07-01</spent_on><created_on>2016-07-01T18:23:00-03:00</created_on><updated_on>2016-07-01T18:23:00-03:00</updated_on></time_entry>

*/
