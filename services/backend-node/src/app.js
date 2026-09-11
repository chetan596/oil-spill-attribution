const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const errorMiddleware = require('./middleware/error.middleware');
const requestIdMiddleware = require('./middleware/request-id.middleware');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(requestIdMiddleware);

app.use('/api/v1', routes);

app.use(errorMiddleware);

module.exports = app;
