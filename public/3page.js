document.addEventListener('DOMContentLoaded', () => {
    const timetableCells = document.querySelectorAll('.timetable td');
    let selectedCells = [];

    timetableCells.forEach(cell => {
        cell.addEventListener('click', () => {
            cell.classList.toggle('selected');
            const cellId = cell.id;

            if (selectedCells.includes(cellId)) {
                selectedCells = selectedCells.filter(id => id !== cellId);
            } else {
                selectedCells.push(cellId);
            }
        });
    });

    const nextButton = document.querySelector('.next-button');
    nextButton.addEventListener('click', () => {
        if (selectedCells.length === 0) {
            alert('적어도 하나의 공강 시간을 선택해주세요.');
            return;
        }

        fetch('/submit-timetable', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ selectedCells }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = '/list'; // 성공 시 이동할 페이지
            } else {
                alert('시간표 전송에 실패했습니다. 다시 시도해주세요.');
            }
        })
        .catch((error) => {
            console.error('Error:', error);
            alert('오류가 발생했습니다. 다시 시도해주세요.');
        });
    });
});
