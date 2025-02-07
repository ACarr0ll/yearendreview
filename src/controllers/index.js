function getIndex(req, res) {
    // Get current date and time for default values
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0,5);

    res.render('index', {
        currentDate: currentDate,
        currentTime: currentTime
    });
}

module.exports = { getIndex };