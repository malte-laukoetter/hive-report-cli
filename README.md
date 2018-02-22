# hive-report-cli

A command line interface that allowes to create and view reports on https://report.hivemc.com.

# Commands

## `hive report [chatlog or gamelog link]` or `hive [chatlog or gamelog link]`

![gif of the hive report command](https://github.com/Lergin/hive-report-cli/raw/master/images/hive-report.gif)

Creates a new report and optionaly fetches all available information from a given log. If it is a hacking report it also allowes to select a video that then will be automaticly uploaded to youtube and then be added to the report (needs a youtube account and will prompt for authentification on the first use). After that it prompts for all other informations and (if not logged in already) a link to login from the server (can be created by running `/login report` on hivemc.com and copying the link). (expects the same information as https://report.hivemc.com and provides simmilar testing of the inputs)

## `hive list` or `hive l`

![image of the hive list command](https://github.com/Lergin/hive-report-cli/raw/master/images/hive-list.png)

Gets the latest 10 reports and there status and displays this infos as a table, may also request a login link as above. (showes the same information as https://report.hivemc.com/submitted)

## `hive info` or `hive i`

![gif of the hive info command](https://github.com/Lergin/hive-report-cli/raw/master/images/hive-info.gif)

Provides a list of all known reports (can be updatet by running `hive list`) and allowes to select one of those and then fetches the available informations about the report. (showes the same information as report.hivemc.com/view/CHATREPORTID)

## `hive settings`

Allowes to change the settings of the cli via flags:

--max-upload-speed <n> sets the maximum upload speed of the video upload in bytes/s

--video-dir <path> sets the path to look for videos

## `hive help [command]` or `hive [command] --help`

Showes general help or help to a provided command