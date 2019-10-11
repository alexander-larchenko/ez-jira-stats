/**
 * @author Alexander Larchenko
 * @date 08.10.2019
 */
(function(){

    function getNumStr(string) {
        return string && /\d/.test(string) ? +string.match(/\d+\.?\d*/)[0] : 0;
    }

    const cellsInd = {
        date: 0,
        issue: 1,
        eventType: 2,
        eventDetail: 3,
        RTE_Inc: 7,
        RTE_Dec: 8,
        Remaining: 9
    };

    class Row {
        row;
        cells;
        fullDate;
        date;
        issueLink;
        issueId;
        eventType;
        eventDetail;
        RTE_Inc;
        RTE_Dec;
        Remaining;

        constructor(row) {
            this.row = row;
            this.cells = row.querySelectorAll('td');
            this.fullDate = this.cells[cellsInd.date].textContent;
            this.date = this.fullDate.split(' ')[0];
            this.issueLink = this.cells[cellsInd.issue].innerHTML;
            this.issueId = this.cells[cellsInd.issue].textContent;
            this.eventType = this.cells[cellsInd.eventType].textContent;
            this.eventDetail = this.cells[cellsInd.eventDetail].textContent;
            this.RTE_Inc = getNumStr(this.cells[cellsInd.RTE_Inc].textContent);
            this.RTE_Dec = getNumStr(this.cells[cellsInd.RTE_Dec].textContent);
            this.Remaining = getNumStr(this.cells[cellsInd.Remaining].textContent);
        }
    }

    class TableData {

        rows;
        startingStats;

        constructor(tableEl) {
            this.rows = [];
            let rowsOfTable = tableEl.querySelectorAll('tbody>tr');
            for (var i = 1; i < rowsOfTable.length; i++) {
                this.rows.push(new Row(rowsOfTable[i]));
            }
            const startingStats = {};
            const startRow = rowsOfTable[0];
            const startData = new Row(startRow);
            const startCells = startRow.querySelectorAll('td');
            const startIncChildren = startCells[cellsInd.RTE_Inc].children;

            let startStories = 0;
            let startTasks = 0;
            let startRTE = 0;

            for (let j = 0; j < startIncChildren.length; j++) {
                const node = startIncChildren[j];
                if (node.textContent === '-') {
                    startStories++;
                } else {
                    startTasks++;
                }
                startRTE += getNumStr(node.textContent);
            }

            this.startingStats = {
                amountOfIssues: startIncChildren.length,
                amountOfStories: startStories,
                amountOfTasks: startTasks,
                startingRTE: startRTE
            };
        }

        getAddedStatistic() {
            const rowsAdded = this.rows.filter((row) => row.eventDetail === 'Issue added to sprint');

            let totalRTE = 0;
            let issuesByDates = {};
            const uniqueIssuesAdded = [];
            rowsAdded.forEach((row) => {
                if (uniqueIssuesAdded.indexOf(row.issueId) === -1) {
                    uniqueIssuesAdded.push(row.issueId);
                }
                if (!(row.date in issuesByDates)) {
                    issuesByDates[row.date] = [row.issueLink];
                } else {
                    issuesByDates[row.date].push(row.issueLink);
                }
            });
            uniqueIssuesAdded.forEach((uniqueIssueAddedId) => {
                let issueAddingIncluded = false;
                this.rows.forEach((row) => {
                    if (row.issueId === uniqueIssueAddedId && row.RTE_Inc > 0) {
                        if (row.eventDetail === 'Issue added to sprint') {
                            if (!issueAddingIncluded) {
                                issueAddingIncluded = true;
                                totalRTE += row.RTE_Inc;
                            }
                        } else {
                            totalRTE += row.RTE_Inc;
                        }
                    }
                });
            });

            return {
                issuesAdded: uniqueIssuesAdded.length,
                issuesRTE: totalRTE,
                issueIds: uniqueIssuesAdded,
                issuesLinks: rowsAdded.map((row) => row.issueLink),
                issuesByDates: issuesByDates
            }
        }

        getRemovedStatistic() {
            const rowsRemoved = this.rows.filter((row) => row.eventDetail === 'Issue removed from sprint');

            let totalRTE = 0;
            let issuesByDates = {};
            rowsRemoved.forEach((row) => {
                totalRTE += row.RTE_Dec;
                if (!(row.date in issuesByDates)) {
                    issuesByDates[row.date] = [row.issueLink];
                } else {
                    issuesByDates[row.date].push(row.issueLink);
                }
            });

            return {
                issuesRemoved: rowsRemoved.length,
                issuesRTE: totalRTE,
                issueIds: rowsRemoved.map((row) => row.issueId),
                issuesLinks: rowsRemoved.map((row) => row.issueLink),
                issuesByDates: issuesByDates
            }
        }

        getTotalStats() {
            const stats = {
                completed: 0,
                reopened: 0,
                totalInc: 0,
                totalDec: 0
            };
            const completedIssues = [];
            const reopenedIssues = [];
            this.rows.forEach((row) => {
                if (row.eventDetail === 'Issue completed' && completedIssues.indexOf(row.issueId) === -1) {
                    completedIssues.push(row.issueId);
                    stats.completed++;
                }
                if (row.eventDetail === 'Issue reopened' && reopenedIssues.indexOf(row.issueId) === -1) {
                    reopenedIssues.push(row.issueId);
                    stats.reopened++;
                }
                stats.totalInc += row.RTE_Inc;
                stats.totalDec += row.RTE_Dec;
            });
            return stats;
        }
    }

    let interval;
    const sprint = {
        name: '',
        id: 0
    };

    function removeModal() {
        var modal = document.getElementById('modal-sprint-data');
        if (modal) {
            document.body.removeChild(modal);
        }
    }

    function findBurndownChartTable() {

        let chartType = document.getElementById("ghx-estimate-picker-trigger");
        if (!chartType || !chartType.textContent === "Remaining Time Estimate") return;

        let sprintNameItem = document.getElementById("ghx-items-trigger");
        if (sprintNameItem && sprintNameItem.textContent) {
            sprint.name = sprintNameItem.textContent;
            sprint.id = sprintNameItem.attributes.getNamedItem('data-item-id').value;
        }

        let dataTable = document.querySelector('#ghx-chart-data>table');
        if (!dataTable) return;

        // run main when found
        clearInterval(interval);
        removeModal();
        main();
    }

    function main() {

        let dataTable = document.querySelector('#ghx-chart-data>table');

        // init Table Data

        const tableData = new TableData(dataTable);

        function promptAlert(text) {
            const body = document.body;
            const div = document.createElement('div');
            div.id = 'modal-sprint-data';
            div.style = `position: fixed;width: 1200px;margin-left: -600px;left: 50%;height: 1000px;margin-top: -500px;top: 50%;
                z-index: 99999;border: 5px solid black;border-radius: 10px;background: white;scroll-y: auto;padding: 15px;overflow-y: auto;`;
            const button = document.createElement('button');
            button.value = button.textContent = 'X';
            button.style = `position: absolute; right: 20px`;
            button.onclick = removeModal;
            const div2 = document.createElement('div');
            div2.innerHTML = `${text}`;
            div.appendChild(button);
            div.appendChild(div2);
            body.appendChild(div);
        }

        function getHeader() {
            return `<h1>${sprint.name}</h1> sprint id: ${sprint.id}`;
        }

        function getAddedStatsText() {
            const stats = tableData.getAddedStatistic();
            let issuesByDatesText = '';
            for (const dateKey in stats.issuesByDates) {
                issuesByDatesText += `<b>${dateKey}:</b> ${stats.issuesByDates[dateKey].join(' | ')}<br>`;
            }
            return `<h2>Added After Sprint Start</h2>
Issues Added to sprint after start (amount): <b>${stats.issuesAdded}</b><br>
Issues Added to sprint after start (total RTE): <b>${stats.issuesRTE} hours</b><br>
Issues Added By Dates:<br>${issuesByDatesText}`;
        }

        function getRemovedStatsText() {
            const stats = tableData.getRemovedStatistic();
            let issuesByDatesText = '';
            for (const dateKey in stats.issuesByDates) {
                issuesByDatesText += `<b>${dateKey}:</b> ${stats.issuesByDates[dateKey].join(' | ')}<br>`;
            }
            return `<h2>Removed After Sprint Start</h2>
Issues Removed from sprint after start (amount): <b>${stats.issuesRemoved}</b><br>
Issues Removed from sprint after start (total RTE): <b>${stats.issuesRTE} hours</b>
${issuesByDatesText ? `<br>Issues Removed By Dates:<br>${issuesByDatesText}` : ''}`;
        }

        function getRemainingHours() {
            const tableRows = dataTable.querySelectorAll('tbody>tr');
            const lastRow = tableRows[tableRows.length -1];
            const lastRowCells = lastRow.querySelectorAll('td');
            const remainingCell = lastRowCells[cellsInd.Remaining];
            if (remainingCell.children.length > 1) {
                return getNumStr(remainingCell.children[remainingCell.children.length - 1].textContent);
            } else {
                return tableData.rows[tableData.rows.length-1].Remaining;
            }
        }

        function getTotalStats() {
            const stats = tableData.getTotalStats();
            const startStats = tableData.startingStats;
            const addedStats = tableData.getAddedStatistic();
            const removedStats = tableData.getRemovedStatistic();
            const RTECompleted = stats.totalDec - removedStats.issuesRTE;

            return `<h2>Total Sprint Stats</h2>
<br>
Unique Issues Taken into the sprint on start (amount): <b>${startStats.amountOfIssues}</b> <i>(${startStats.amountOfStories} stories, ${startStats.amountOfTasks} tasks)</i><br>
Unique Issues Added during the sprint (amount): <b>${addedStats.issuesAdded}</b><br>
Unique Issues Removed during the sprint (amount): <b>${removedStats.issuesRemoved}</b><br>
Unique Issues Completed during the sprint (amount): <b>${stats.completed}</b><br>
Unique Issues Reopened during the sprint (amount): <b>${stats.reopened}</b><br>
<br>
Total RTE on sprint start : <b>${startStats.startingRTE} hours</b><br>
Total RTE Increase (includes added and re-estimated tasks): <b>${stats.totalInc} hours</b> <i>(${addedStats.issuesRTE}h from added tasks, ${stats.totalInc - addedStats.issuesRTE}h from re-estimated)</i><br>
Total RTE Decrease (includes removed and completed tasks): ${stats.totalDec} hours <i>(<b>${RTECompleted}h</b> from completed tasks, ${removedStats.issuesRTE}h from removed)</i><br>
Total RTE in the end of sprint: <b>${getRemainingHours()} hours</b><br>

<h2>Major</h2>
Issues completed vs taken on start: <span style="font-weight: bold;color: ${stats.completed > startStats.amountOfIssues ? 'green' : 'red'}">${stats.completed}</span> vs ${startStats.amountOfIssues}<br>
RTE completed vs starting: <span style="font-weight: bold;color: ${RTECompleted > startStats.startingRTE ? 'green' : 'red'}">${RTECompleted}h</span> vs ${startStats.startingRTE}h`;
        }

        promptAlert(getHeader() + getAddedStatsText() + getRemovedStatsText() + getTotalStats());
    }

    const button = document.createElement('button');
    button.value = button.textContent = 'Show Chart Data';
    button.style = 'position: relative; top: auto; left: 500px; background: yellow; width: 170px; height: 30px;';
    button.onclick = function () {
        interval = setInterval(findBurndownChartTable, 500);
        // findBurndownChartTable();
    };
    const container = document.getElementById('ghx-chart-header-primary');
    (container ? container : document.body).appendChild(button);
})();
